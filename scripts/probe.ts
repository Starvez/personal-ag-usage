import { spawn } from 'child_process';
import * as https from 'https';
import * as fs from 'fs';
import * as os from 'os';

// CONSTANTS (Borrowed from reference to ensure connection success)
const PROCESS_IDENTIFIERS = {
    LANGUAGE_SERVER: 'language_server',
    ANTIGRAVITY: 'antigravity',
    CSRF_TOKEN: '--csrf_token'
};
const API_ENDPOINTS = {
    GET_USER_STATUS: '/exa.language_server_pb.LanguageServerService/GetUserStatus'
};

// UTILS
function executeCommand(command: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
        const proc = spawn(command, args, { shell: false });
        let stdout = '';
        proc.stdout.on('data', (d) => stdout += d.toString());
        proc.on('close', (code) => code === 0 ? resolve(stdout) : reject(new Error(`Command failed with ${code}`)));
        proc.on('error', reject);
    });
}
function validatePid(pid: number): boolean { return Number.isInteger(pid) && pid > 0; }
function validatePort(port: number): boolean { return Number.isInteger(port) && port >= 1 && port <= 65535; }

// LOGIC
async function findAntigravityProcess() {
    // Simplified Unix Logic for Linux environment
    const stdout = await executeCommand('ps', ['-eo', 'pid,args']);
    const lines = stdout.split('\n');
    
    // Find process with 'antigravity' AND '--csrf_token'
    const match = lines.find(line => 
        line.includes(PROCESS_IDENTIFIERS.ANTIGRAVITY) || 
        line.includes(PROCESS_IDENTIFIERS.CSRF_TOKEN)
    );

    if (!match) throw new Error("Could not find Antigravity process.");
    
    const pidMatch = match.trim().match(/^(\d+)/);
    if (!pidMatch) throw new Error("Could not parse PID.");
    
    const pid = parseInt(pidMatch[1], 10);
    console.log(`Found Antigravity PID: ${pid}`);
    
    // Extract CSRF Token from command line args
    const tokenMatch = match.match(/--csrf_token[=\s]([\w-]+)/);
    // Note: If token is not in args, we might need another way, but reference suggests it is.
    // Actually reference code calls 'lsof' to find env? 
    // Wait, reference code in 'findAntigravityProcess' looks for process, 
    // but the token is usually passed OR in env. 
    // Let's try to read /proc/{pid}/environ if arg fails.
    
    let csrfToken = tokenMatch ? tokenMatch[1] : null;
    if (!csrfToken) {
        // Try reading environ
        try {
            const environ = fs.readFileSync(`/proc/${pid}/environ`);
            // format is key=val\0key=val
            const envs = environ.toString().split('\0');
            // It might be named differently in ENV. 
            // The reference creates the request with 'X-Codeium-Csrf-Token'. 
            // Often it's passed as arg. Let's hope it's in args for now.
        } catch (e) { console.warn("Could not read /proc/environ", e); }
    }
    
    // Wait, looking at reference code 'checkPort' takes 'csrfToken'.
    // BUT 'findAntigravityProcess' logic in reference DOES NOT extract the token.
    // The reference actually seems to assume we *have* the token? 
    // NO, wait. The reference `findAntigravityProcess` returns a `ProcessInfo`.
    // Where does it get the token?
    // AH! I missed it. The reference passes `csrfToken` to `checkPort` but where does it come from?
    // Let's re-read api.ts in the user context if needed.
    // Actually, looking at `api.ts` again... 
    // I don't see `getCsrfToken` function! 
    // Wait. `findListeningPorts` -> `checkPort`.
    // The `csrfToken` variable must be sourced from somewhere.
    // Let's look at `extension.ts` in the reference if possible. 
    // For now, I will assume it's possibly in the process arguments.
    
    return { pid, csrfToken }; 
}

async function findPorts(pid: number) {
    // Linux 'ss' or 'lsof'
    try {
        const stdout = await executeCommand('lsof', ['-iTCP', '-sTCP:LISTEN', '-n', '-P', '-p', String(pid)]);
        const ports = [];
        const regex = /:(\d+)\s+\(LISTEN\)/g;
        let m;
        while ((m = regex.exec(stdout)) !== null) {
            ports.push(parseInt(m[1], 10));
        }
        return [...new Set(ports)];
    } catch (e) {
        console.log("lsof failed, trying netstat");
        // Fallback or just fail for now (User is on Linux)
        return [];
    }
}

async function queryStatus(port: number, csrfToken: string) {
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: '127.0.0.1',
            port: port,
            path: API_ENDPOINTS.GET_USER_STATUS,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Codeium-Csrf-Token': csrfToken || 'null', // Try without if clean
            },
            rejectUnauthorized: false
        }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve({ status: res.statusCode, data: data }));
        });
        req.on('error', reject);
        req.write(JSON.stringify({ metadata: { ideName: 'antigravity', ideVersion: '1.0.0' } }));
        req.end();
    });
}

async function main() {
    try {
        console.log("Step 1: finding process...");
        const { pid, csrfToken } = await findAntigravityProcess();
        
        console.log("Step 2: finding ports...");
        const ports = await findPorts(pid);
        console.log("Found ports:", ports);

        // We need the token. If we didn't find it in args, we might need to look harder.
        // Let's try to fetch from all ports.
        
        for (const port of ports) {
            console.log(`Querying Port ${port}...`);
            try {
                // We will try with the found token, or empty if none (some local servers don't enforce strict CSRF for localhost if origin matches?)
                // Actually the reference enforces it.
                // Let's look for the token in the 'cmd' properly.
                const res: any = await queryStatus(port, csrfToken || '');
                console.log(`Response [${res.status}]:`, res.data.substring(0, 200) + "...");
                
                if (res.status === 200) {
                    fs.writeFileSync('raw_usage_dump.json', res.data);
                    console.log("SUCCESS! Dumped to raw_usage_dump.json");
                    return;
                }
            } catch (e) {
                console.log(`Failed port ${port}:`, e.message);
            }
        }
    } catch (e) {
        console.error("FATAL:", e);
    }
}

main();
