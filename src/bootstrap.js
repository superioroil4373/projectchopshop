const fs = require('fs');
const path = require('path');
const os = require('os');

const ENGINE_DIR = path.join(os.homedir(), '.chopshop_local');
const ENV_PATH = path.join(ENGINE_DIR, '.env');
const DAEMON_PATH = path.join(ENGINE_DIR, 'daemon_core.js');

// 1. Dependency-Free Environment Loader
// Automator runs in a restricted shell without access to your normal bash/zsh profiles.
// This manually parses the .env file so WORKER_URL is available to the bootstrapper and the daemon.
if (fs.existsSync(ENV_PATH)) {
    const envFile = fs.readFileSync(ENV_PATH, 'utf8');
    envFile.split('\n').forEach(line => {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (match) {
            process.env[match[1]] = match[2].replace(/^["']|["']$/g, '').trim();
        }
    });
}

const WORKER_URL = process.env.WORKER_URL;

async function bootstrap() {
    console.log("[ChopShop App] Checking for daemon updates...");
    
    if (!WORKER_URL || WORKER_URL.includes("your-worker-url")) {
        console.error("[ChopShop App] Fatal: WORKER_URL is missing or invalid in ~/.chopshop_local/.env");
        process.exit(1);
    }

    try {
        // 2. Fetch the latest daemon_core.js securely via the Cloudflare Worker proxy
        const response = await fetch(`${WORKER_URL}/updater/daemon`);
        
        if (response.ok) {
            const coreCode = await response.text();
            
            // 3. Save with strict owner-only permissions (0o600)
            fs.writeFileSync(DAEMON_PATH, coreCode, { encoding: 'utf8', mode: 0o600 });
            console.log("[ChopShop App] Core updated successfully.");
        } else {
            console.warn(`[ChopShop App] Update check failed (${response.status}). Using cached daemon if available.`);
        }
    } catch (err) {
        console.warn("[ChopShop App] Network offline or worker unreachable. Using cached daemon.");
    }

    // 4. Hand off execution to the daemon
    if (fs.existsSync(DAEMON_PATH)) {
        // Clear the module cache just in case the Node process is restarted dynamically
        delete require.cache[require.resolve(DAEMON_PATH)];
        require(DAEMON_PATH);
    } else {
        console.error("[ChopShop App] Fatal: No daemon_core.js found locally, and download failed.");
        process.exit(1);
    }
}

bootstrap();
