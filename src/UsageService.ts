/**
 * Usage Service Module
 * Handles process discovery, API communication, and usage tracking for the AntiGravity API
 *
 * This module provides:
 * - Cross-platform process discovery (Windows, Linux, macOS)
 * - Automatic port detection and validation
 * - HTTPS API client with retry logic
 * - Local usage tracking based on quota drops
 * - Connection caching for performance
 */

import { spawn } from 'child_process';
import * as vscode from 'vscode';
import * as https from 'https';
import * as os from 'os';
import * as fs from 'fs';
import {
    API_ENDPOINTS,
    CACHE_TTL_MS,
    CONFIG_NAMESPACE,
    HTTP_SUCCESS_MAX,
    HTTP_SUCCESS_MIN,
    IDE_INFO,
    LOCALHOST,
    MAX_PORT,
    MAX_RETRY_ATTEMPTS,
    MAX_VALID_PID,
    MIN_PORT,
    PROCESS_IDENTIFIERS,
    REQUEST_TIMEOUT_MS,
    RETRY_DELAY_MS,
    STORAGE_KEY_HISTORY,
    STORAGE_KEY_LAST_QUOTAS,
    USAGE_DETECTION_MAX_THRESHOLD,
    USAGE_DETECTION_MIN_THRESHOLD,
    USAGE_HISTORY_WINDOW_MS
} from './constants';
import {
    CachedConnection,
    ServerUserStatusResponse,
    UsageData,
    QuotaGroup
} from './types';


// --- PROCESS FINDING LOGIC ---

function executeCommand(command: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
        const proc = spawn(command, args, { shell: false });
        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', d => stdout += d.toString());
        proc.stderr.on('data', d => stderr += d.toString());
        proc.on('close', code => code === 0 ? resolve(stdout) : reject(new Error(stderr || `Exited with ${code}`)));
        proc.on('error', reject);
    });
}

function validatePid(pid: number): boolean { return Number.isInteger(pid) && pid > 0 && pid <= MAX_VALID_PID; }
function validatePort(port: number): boolean { return Number.isInteger(port) && port >= MIN_PORT && port <= MAX_PORT; }

async function findAntigravityProcess(): Promise<{ pid: number, csrfToken: string }> {
    const platform = os.platform();
    
    if (platform === 'win32') {
        // Windows implementation using PowerShell
        const stdout = await executeCommand('powershell', [
            '-NoProfile',
            '-Command',
            `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${PROCESS_IDENTIFIERS.ANTIGRAVITY}*' -or $_.CommandLine -like '*${PROCESS_IDENTIFIERS.CSRF_TOKEN}*' } | Select-Object ProcessId, CommandLine | ForEach-Object { "$($_.ProcessId) $($_.CommandLine)" }`
        ]);
        const lines = stdout.split('\n').filter(l => l.trim());

        if (lines.length === 0) throw new Error("Antigravity process not found.");

        for (const line of lines) {
            try {
                const token = extractCsrfToken(line);
                const pidMatch = line.trim().match(/^(\d+)/);
                if (pidMatch && token) {
                    return { pid: parseInt(pidMatch[1], 10), csrfToken: token };
                }
            } catch {
                // Continue if no token found in this candidate
            }
        }
        throw new Error("Found Antigravity process(es) but NONE had a CSRF token in args.");
    } else {
        // Unix/Linux/macOS implementation
        const stdout = await executeCommand('ps', ['-ww', '-eo', 'pid,args']);
        const lines = stdout.split('\n');

        // Filter candidates
        const candidates = lines.filter(line =>
            line.includes(PROCESS_IDENTIFIERS.ANTIGRAVITY) ||
            line.includes(PROCESS_IDENTIFIERS.CSRF_TOKEN)
        );

        if (candidates.length === 0) throw new Error("Antigravity process not found.");

        // Iterate to find one with a token
        for (const cmd of candidates) {
            try {
                const token = extractCsrfToken(cmd);
                const pidMatch = cmd.trim().match(/^(\d+)/);
                if (pidMatch && token) {
                    return { pid: parseInt(pidMatch[1], 10), csrfToken: token };
                }
            } catch {
                // Continue if no token found in this candidate
            }
        }

        throw new Error("Found Antigravity process(es) but NONE had a CSRF token in args.");
    }
}

async function findListeningPorts(pid: number): Promise<number[]> {
    const platform = os.platform();
    
    if (platform === 'win32') {
        // Windows implementation using netstat
        try {
            const stdout = await executeCommand('netstat', ['-ano']);
            const ports: number[] = [];
            const lines = stdout.split('\n');
            
            for (const line of lines) {
                // Match lines with LISTENING state and our PID
                // Format: TCP    127.0.0.1:12345    0.0.0.0:0    LISTENING    1234
                if (!line.includes('LISTENING')) continue;
                
                const parts = line.trim().split(/\s+/);
                const linePid = parseInt(parts[parts.length - 1], 10);
                
                if (linePid === pid) {
                    // Extract port from address (e.g., "127.0.0.1:12345" or "[::]:12345")
                    const addressPart = parts[1];
                    const portMatch = addressPart.match(/:(\d+)$/);
                    if (portMatch) {
                        ports.push(parseInt(portMatch[1], 10));
                    }
                }
            }
            return [...new Set(ports)];
        } catch (e) {
            throw new Error(`Failed to find ports on Windows: ${e}`);
        }
    } else {
        // Unix/Linux/macOS implementation
        // Try lsof first
        try {
            const stdout = await executeCommand('lsof', ['-iTCP', '-sTCP:LISTEN', '-n', '-P', '-p', String(pid)]);
            const ports: number[] = [];
            const regex = /:(\d+)\s+\(LISTEN\)/g;
            let m;
            while ((m = regex.exec(stdout)) !== null) {
                ports.push(parseInt(m[1], 10));
            }
            return [...new Set(ports)];
        } catch {
            // Fallback to netstat
            try {
                const stdout = await executeCommand('netstat', ['-tlnp']);
                const ports: number[] = [];
                const lines = stdout.split('\n');
                const pidPattern = new RegExp(`\\b${pid}/`);
                for (const line of lines) {
                    if (!pidPattern.test(line)) continue;
                    const match = line.match(/:(\d+)\s/);
                    if (match) ports.push(parseInt(match[1], 10));
                }
                return ports;
            } catch (e) {
                throw new Error(`Failed to find ports: ${e}`);
            }
        }
    }
}

// --- API CLIENT ---

function extractCsrfToken(cmd: string): string {
    const patterns = [
        /--csrf_token[=\s]+"([^"]+)"/i,
        /--csrf_token[=\s]+'([^']+)'/i,
        /--csrf_token[=\s]+([\w-]+)/i
    ];
    for (const pattern of patterns) {
        const match = cmd.match(pattern);
        if (match?.[1]) return match[1].trim();
    }
    throw new Error("CSRF token not found in process args.");
}

/**
 * Makes an HTTPS request to the AntiGravity API with retry logic
 * @param port Port number to connect to
 * @param csrfToken CSRF token for authentication
 * @param path API endpoint path
 * @param body Request body
 * @param attemptNumber Current retry attempt (for internal use)
 * @returns Promise resolving to the API response
 */
async function makeRequest<T>(port: number, csrfToken: string, path: string, body: object, attemptNumber: number = 1): Promise<T> {
    const config = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
    const verifySSL = config.get<boolean>('security.verifySSL', true);
    const maxRetries = config.get<number>('network.retryAttempts', MAX_RETRY_ATTEMPTS);
    const retryDelay = config.get<number>('network.retryDelay', RETRY_DELAY_MS);

    return new Promise((resolve, reject) => {
        const payload = JSON.stringify(body);
        const req = https.request({
            hostname: LOCALHOST,
            port,
            path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Codeium-Csrf-Token': csrfToken,
                'Content-Length': Buffer.byteLength(payload)
            },
            timeout: REQUEST_TIMEOUT_MS,
            rejectUnauthorized: verifySSL
        }, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                if (res.statusCode && (res.statusCode < HTTP_SUCCESS_MIN || res.statusCode > HTTP_SUCCESS_MAX)) {
                    const error = new Error(`HTTP ${res.statusCode}`);

                    // Retry on server errors (5xx) but not client errors (4xx)
                    if (res.statusCode >= 500 && attemptNumber < maxRetries) {
                        console.warn(`Request failed with ${res.statusCode}, retrying (${attemptNumber}/${maxRetries})...`);
                        setTimeout(() => {
                            makeRequest<T>(port, csrfToken, path, body, attemptNumber + 1)
                                .then(resolve)
                                .catch(reject);
                        }, retryDelay * attemptNumber); // Exponential backoff
                        return;
                    }

                    return reject(error);
                }
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error(`Failed to parse response: ${e}`));
                }
            });
        });

        req.on('error', (err) => {
            // Retry on network errors
            if (attemptNumber < maxRetries) {
                console.warn(`Request failed with network error, retrying (${attemptNumber}/${maxRetries}):`, err.message);
                setTimeout(() => {
                    makeRequest<T>(port, csrfToken, path, body, attemptNumber + 1)
                        .then(resolve)
                        .catch(reject);
                }, retryDelay * attemptNumber); // Exponential backoff
            } else {
                reject(err);
            }
        });

        req.on('timeout', () => {
            req.destroy();
            const error = new Error("Request timeout");

            // Retry on timeout
            if (attemptNumber < maxRetries) {
                console.warn(`Request timed out, retrying (${attemptNumber}/${maxRetries})...`);
                setTimeout(() => {
                    makeRequest<T>(port, csrfToken, path, body, attemptNumber + 1)
                        .then(resolve)
                        .catch(reject);
                }, retryDelay * attemptNumber); // Exponential backoff
            } else {
                reject(error);
            }
        });

        req.write(payload);
        req.end();
    });
}

// --- PUBLIC SERVICE ---

/**
 * Service for retrieving AntiGravity usage data
 * Manages connection to the local AntiGravity API server and tracks quota usage
 */
export class UsageService {
    private cachedConnection: CachedConnection | null = null;
    private storage: vscode.Memento;

    /**
     * Creates a new UsageService instance
     * @param storage VSCode Memento for persisting usage history
     */
    constructor(storage: vscode.Memento) {
        this.storage = storage;
    }

    private async getConnection(): Promise<CachedConnection> {
        // Check cache
        if (this.cachedConnection && (Date.now() - this.cachedConnection.timestamp < CACHE_TTL_MS)) {
            return this.cachedConnection;
        }

        // Fresh connection
        console.log("Establishing fresh connection...");
        const { pid, csrfToken } = await findAntigravityProcess();
        const ports = await findListeningPorts(pid);

        if (ports.length === 0) throw new Error("No ports found");

        // Validate ports by attempting API connection
        const failedPorts: Array<{ port: number; error: string }> = [];

        for (const port of ports) {
            try {
                console.log(`Validating port ${port}...`);
                await makeRequest(port, csrfToken, API_ENDPOINTS.GET_USER_STATUS, { metadata: { ideName: IDE_INFO.NAME } });

                console.log(`Successfully connected on port ${port}`);
                const connection = { port, csrfToken, timestamp: Date.now() };
                this.cachedConnection = connection;
                return connection;
            } catch (e) {
                const errorMsg = e instanceof Error ? e.message : String(e);
                failedPorts.push({ port, error: errorMsg });
                console.warn(`Port ${port} failed validation: ${errorMsg}`);
            }
        }

        // All ports failed - provide detailed error
        const errorDetails = failedPorts
            .map(({ port, error }) => `  - Port ${port}: ${error}`)
            .join('\n');
        throw new Error(`Could not validate any port. Tried ${ports.length} port(s):\n${errorDetails}`);
    }

    /**
     * Retrieves comprehensive usage data from the AntiGravity API
     * Includes plan information, model quotas, and local usage tracking
     * @returns Promise resolving to complete usage data
     * @throws Error if connection fails or API returns invalid data
     */
    public async getUsageData(): Promise<UsageData> {
        const conn = await this.getConnection();
        const res = await makeRequest<ServerUserStatusResponse>(
            conn.port,
            conn.csrfToken,
            API_ENDPOINTS.GET_USER_STATUS,
            { metadata: { ideName: IDE_INFO.NAME } }
        );

        if (!res.userStatus) throw new Error("Invalid response: missing userStatus");

        // Parse Plan Info (Global Credits)
        const planStatus = res.userStatus.planStatus;
        const planInfo = planStatus?.planInfo;
        const defaultConfig = planInfo?.defaultTeamConfig;

        const globalStats = {
            planName: planInfo?.planName || 'Unknown',
            features: {
                fastAutocomplete: planInfo?.hasAutocompleteFastMode || false,
                premiumModels: planInfo?.allowPremiumCommandModels || false,
                webSearch: planInfo?.cascadeWebSearchEnabled || false,
                chatInputLimit: planInfo?.maxNumChatInputTokens || 'Unknown'
            },
            capabilities: {
                browser: planInfo?.browserEnabled || false,
                knowledgeBase: planInfo?.knowledgeBaseEnabled || false,
                mcp: defaultConfig?.allowMcpServers || false,
                autoRun: planInfo?.cascadeCanAutoRunCommands || false
            },
            promptCreditsCode: {
                total: planInfo?.monthlyPromptCredits || 0,
                available: planStatus?.availablePromptCredits || 0
            },
            flowCredits: {
                total: planInfo?.monthlyFlowCredits || 0,
                available: planStatus?.availableFlowCredits || 0
            }
        };

        // Parse Models
        const modelsRaw = res.userStatus.cascadeModelConfigData?.clientModelConfigs || [];
        const models: QuotaGroup[] = modelsRaw.map((m: any) => {
            const mime = m.supportedMimeTypes || {};
            return {
                label: m.label,
                rawQuota: m.quotaInfo?.remainingFraction ?? 0,
                resetTime: m.quotaInfo?.resetTime ?? null,
                tierAllowed: true,
                isRecommended: m.isRecommended || false,
                tag: m.tagTitle,
                skills: {
                    image: m.supportsImages || !!mime['image/jpeg'] || !!mime['image/png'],
                    video: !!mime['video/mp4'] || !!mime['video/mpeg'] || !!mime['video/webm'], // Approximate
                    audio: !!mime['audio/wav'] || !!mime['audio/mpeg'], // Approximate
                    docs: !!mime['application/pdf'] || !!mime['text/csv'] || !!mime['application/rtf']
                }
            };
        });

        // --- LOCAL USAGE TRACKING ---
        let weeklyUsage = 0;
        try {
            await this.trackUsage(models);
            weeklyUsage = this.getWeeklyUsage();
        } catch (e) {
            console.error("Failed to track local usage:", e);
        }

        // Deduplicate/Group smart logic?
        // Actually, let's return raw models and let UI handle grouping to keep service pure.

        return {
            global: globalStats,
            models: models,
            weeklyUsage: weeklyUsage
        };
    }

    private async trackUsage(models: QuotaGroup[]) {
        // 1. Get History
        let history: { ts: number, delta: number }[] = this.storage.get(STORAGE_KEY_HISTORY, []);
        // 2. Get Last Quotas
        let lastQuotas: Record<string, number> = this.storage.get(STORAGE_KEY_LAST_QUOTAS, {});

        const now = Date.now();
        let totalDelta = 0;

        for (const m of models) {
            if (!m.resetTime) continue; // Only track finite models

            const current = m.rawQuota; // 0.0 to 1.0
            const last = lastQuotas[m.label];

            if (last !== undefined) {
                // DETECT DROP
                if (current < last) {
                    const diff = last - current;
                    // Filter out noise and resets: Only track drops between thresholds
                    // Min threshold (0.0001) filters floating-point noise
                    // Max threshold (0.9) filters quota resets
                    if (diff > USAGE_DETECTION_MIN_THRESHOLD && diff < USAGE_DETECTION_MAX_THRESHOLD) {
                        totalDelta += diff;
                    }
                }
                // RESET DETECTION (Implicit): If current > last, we just update last, don't track negative usage.
            }
            lastQuotas[m.label] = current;
        }

        // 3. Record Drop
        if (totalDelta > 0) {
            history.push({ ts: now, delta: totalDelta });
        }

        // 4. Prune History (older than configured window)
        history = history.filter(h => (now - h.ts) < USAGE_HISTORY_WINDOW_MS);

        // 5. Save
        await this.storage.update(STORAGE_KEY_HISTORY, history);
        await this.storage.update(STORAGE_KEY_LAST_QUOTAS, lastQuotas);
    }

    private getWeeklyUsage(): number {
        const history: { ts: number, delta: number }[] = this.storage.get(STORAGE_KEY_HISTORY, []);
        return history.reduce((sum, h) => sum + h.delta, 0);
    }
}
