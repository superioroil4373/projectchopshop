const os = require('os');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execSync, execFileSync } = require('child_process');

// SANITIZED: Use environment variables for sensitive URLs
const WORKER_URL = process.env.WORKER_URL || "https://your-worker-url.workers.dev";
const LOCAL_USER = os.userInfo().username.toLowerCase();

// SANITIZED: Replaced hardcoded Box path with an environment variable fallback
const CHOPSHOP_ROOT = process.env.CHOPSHOP_ROOT || path.join(
    os.homedir(),
    'Documents/ChopShop_Templates' // Generic placeholder for public users
);

const ENGINE_DIR = path.join(os.homedir(), '.chopshop_local');

if (!fs.existsSync(ENGINE_DIR)) {
    fs.mkdirSync(ENGINE_DIR, { recursive: true, mode: 0o700 });
}

function getMachineHash() {
    try {
        const rawUuid = execSync("ioreg -rd1 -c IOPlatformExpertDevice | awk '/IOPlatformUUID/ { split($0, line, \"\\\"\"); print line[4] }'").toString().trim();
        return crypto.createHash('sha256').update(rawUuid).digest('hex');
    } catch {
        return crypto.createHash('sha256').update(os.hostname()).digest('hex');
    }
}

async function fetchLatestEngine() {
    const hash = getMachineHash();
    const url = `${WORKER_URL}/?hash=${hash}&user=${encodeURIComponent(LOCAL_USER)}`;
    const res = await fetch(url);
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Engine update failed (${res.status}): ${err}`);
    }
    return await res.text();
}

async function pollQueue() {
    const url = `${WORKER_URL}/slack/queue?user=${encodeURIComponent(LOCAL_USER)}&_t=${Date.now()}`;
    const response = await fetch(url, { cache: 'no-store' });
    
    if (response.status === 200) {
        const rawText = await response.text();
        if (!rawText) return;
        
        let job;
        try {
            job = JSON.parse(rawText);
        } catch (jsonErr) {
            console.warn(`[Slack Daemon] Received malformed payload, ignoring.`);
            return;
        }
        
        const templateKey = job.template || job.category;
        
        if (job && templateKey) {
            console.log(`[Slack Daemon] Received render job: ${templateKey}`);

            const secureJobId = crypto.randomUUID();
            const ephemeralEnginePath = path.join(ENGINE_DIR, `chopshop_${secureJobId}.js`);
            
            try {
                const engineCode = await fetchLatestEngine();
                fs.writeFileSync(ephemeralEnginePath, engineCode, { encoding: 'utf8', mode: 0o600 });

                const normalizedPayload = {
                    ...job,
                    category: templateKey,
                    template: templateKey
                };

                const envWithWorker = { 
                    ...process.env, 
                    WORKER_URL: WORKER_URL,
                    CHOPSHOP_ROOT: CHOPSHOP_ROOT,
                    CHOPSHOP_PAYLOAD: JSON.stringify(normalizedPayload)
                };

                execFileSync(process.execPath, [ephemeralEnginePath], { 
                    stdio: 'inherit', 
                    env: envWithWorker,
                    cwd: CHOPSHOP_ROOT 
                });

            } finally {
                if (fs.existsSync(ephemeralEnginePath)) {
                    fs.unlinkSync(ephemeralEnginePath);
                }
            }
        }
    }
}

async function startDaemon() {
    console.log(`[ChopShop Daemon] Polling Slack queue for user: ${LOCAL_USER} (1.5s intervals)`);
    
    while (true) {
        try {
            await pollQueue();
            await new Promise(resolve => setTimeout(resolve, 1500));
        } catch (e) {
            if (!e.message?.includes('fetch failed')) {
                console.error(`[Slack Daemon Error]`, e.message);
            }
            console.log(`[ChopShop Daemon] Backing off for 15 seconds due to error...`);
            await new Promise(resolve => setTimeout(resolve, 15000));
        }
    }
}

startDaemon();
