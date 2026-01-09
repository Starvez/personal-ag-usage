import { spawn } from 'child_process';
import * as vscode from 'vscode';
import * as https from 'https';
import * as os from 'os';
import * as fs from 'fs';
import {
    API_ENDPOINTS,
    IDE_INFO,
    MAX_PORT,
    MAX_PORT_VALIDATION_ATTEMPTS,
    MAX_VALID_PID,
    MIN_PORT,
    PROCESS_IDENTIFIERS,
    REQUEST_TIMEOUT_MS,
    RETRY_DELAY_MS
} from './constants';
import {
    CachedConnection,
    ServerUserStatusResponse,
    UsageData,
    QuotaGroup
} from './types';

const LOCALHOST = '127.0.0.1';

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
    // Linux focused implementation for now
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

async function findListeningPorts(pid: number): Promise<number[]> {
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

async function makeRequest<T>(port: number, csrfToken: string, path: string, body: object): Promise<T> {
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
            rejectUnauthorized: false
        }, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
                    return reject(new Error(`HTTP ${res.statusCode}`));
                }
                try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
            });
        });

        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error("Timeout")); });
        req.write(payload);
        req.end();
    });
}

// --- PUBLIC SERVICE ---

export class UsageService {
    private cachedConnection: CachedConnection | null = null;
    private storage: vscode.Memento;

    constructor(storage: vscode.Memento) {
        this.storage = storage;
    }

    private async getConnection(): Promise<CachedConnection> {
        // Check cache
        if (this.cachedConnection && (Date.now() - this.cachedConnection.timestamp < 300000)) {
            return this.cachedConnection;
        }

        // Fresh connection
        console.log("Establishing fresh connection...");
        const { pid, csrfToken } = await findAntigravityProcess();
        const ports = await findListeningPorts(pid);

        if (ports.length === 0) throw new Error("No ports found");

        // Validate ports
        for (const port of ports) {
            try {
                // Determine if valid by making a harmless request (or just the real one)
                // We'll just assume the first working one is correct.
                await makeRequest(port, csrfToken, API_ENDPOINTS.GET_USER_STATUS, { metadata: { ideName: IDE_INFO.NAME } });

                const connection = { port, csrfToken, timestamp: Date.now() };
                this.cachedConnection = connection;
                return connection;
            } catch (e) {
                console.warn(`Port ${port} failed validation`, e);
            }
        }
        throw new Error("Could not validate any port.");
    }

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
        const STORAGE_KEY_HISTORY = 'usage_history_v1';
        const STORAGE_KEY_LAST_QUOTAS = 'last_quotas_v1';

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
                    // Ignore tiny noise or massive jumps that look like errors (optional, but good for safety)
                    if (diff > 0.0001 && diff < 0.9) {
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

        // 4. Prune History (> 7 days)
        const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
        history = history.filter(h => (now - h.ts) < ONE_WEEK_MS);

        // 5. Save
        await this.storage.update(STORAGE_KEY_HISTORY, history);
        await this.storage.update(STORAGE_KEY_LAST_QUOTAS, lastQuotas);
    }

    private getWeeklyUsage(): number {
        const history: { ts: number, delta: number }[] = this.storage.get('usage_history_v1', []);
        return history.reduce((sum, h) => sum + h.delta, 0);
    }
}
