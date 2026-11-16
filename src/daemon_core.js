const os = require('os');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execSync, execFileSync } = require('child_process');

// 1. Initialize configuration and paths BEFORE loading Google Cloud SDKs (prevents pkg TDZ errors)
const ENGINE_DIR = path.join(os.homedir(), '.chopshop_local');
const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID || 'your-gcp-project-id';
const SUBSCRIPTION_NAME = process.env.PUBSUB_SUBSCRIPTION || 'chopshop-mac-daemon';
const KEY_FILENAME = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(ENGINE_DIR, 'chopshop-daemon-key.json');

const WORKER_URL = process.env.WORKER_URL || 'https://your-worker-url.workers.dev';
const LOCAL_USER = os.userInfo().username.toLowerCase();
const CHOPSHOP_ROOT = process.env.CHOPSHOP_ROOT || path.join(
    os.homedir(),
    'Documents/ChopShop_Templates'
);

process.env.GOOGLE_APPLICATION_CREDENTIALS = KEY_FILENAME;

if (!fs.existsSync(ENGINE_DIR)) {
    fs.mkdirSync(ENGINE_DIR, { recursive: true, mode: 0o700 });
}

// 2. Load GCP clients after environment initialization
const { PubSub } = require('@google-cloud/pubsub');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');

const pubsub = new PubSub({ projectId: GCP_PROJECT_ID });
const secretClient = new SecretManagerServiceClient({ projectId: GCP_PROJECT_ID });

function getMachineHash() {
    try {
        const rawUuid = execSync("ioreg -rd1 -c IOPlatformExpertDevice | awk '/IOPlatformUUID/ { split($0, line, \"\\\"\"); print line[4] }'").toString().trim();
        return crypto.createHash('sha256').update(rawUuid).digest('hex');
    } catch {
        return crypto.createHash('sha256').update(os.hostname()).digest('hex');
    }
}

async function getSigningSecret() {
    const secretPath = `projects/${GCP_PROJECT_ID}/secrets/ENGINE_SIGNING_SECRET/versions/latest`;
    const [version] = await secretClient.accessSecretVersion({ name: secretPath });
    return version.payload.data.toString('utf8').trim();
}

function verifySignature(payload, signatureHex, secret) {
    if (!signatureHex || typeof signatureHex !== 'string') return false;

    const expectedHex = crypto
        .createHmac('sha256', secret)
        .update(payload, 'utf8')
        .digest('hex');

    const sigBuf = Buffer.from(signatureHex, 'hex');
    const expBuf = Buffer.from(expectedHex, 'hex');

    if (sigBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expBuf);
}

async function fetchVerifiedEngine() {
    const hash = getMachineHash();
    const url = `${WORKER_URL}/?hash=${hash}&user=${encodeURIComponent(LOCAL_USER)}`;
    const res = await fetch(url);

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Engine fetch failed (${res.status}): ${err}`);
    }

    const engineCode = await res.text();
    const signature = res.headers.get('X-Engine-Signature');
    const signingSecret = await getSigningSecret();

    if (!verifySignature(engineCode, signature, signingSecret)) {
        throw new Error('SECURITY ALERT: Engine payload HMAC-SHA256 signature verification failed.');
    }

    return engineCode;
}

function startDaemon() {
    const subscription = pubsub.subscription(SUBSCRIPTION_NAME);
    console.log(`[ChopShop Daemon] Listening via StreamingPull on ${SUBSCRIPTION_NAME} for user: ${LOCAL_USER}...`);

    subscription.on('message', async (message) => {
        let job;
        try {
            const rawText = message.data.toString('utf8');
            job = JSON.parse(rawText);
        } catch {
            console.warn(`[ChopShop Daemon] Received malformed JSON payload (${message.id}), discarding.`);
            message.ack();
            return;
        }

        const templateKey = job.template || job.category;
        if (!job || !templateKey) {
            console.warn(`[ChopShop Daemon] Payload missing template/category (${message.id}), discarding.`);
            message.ack();
            return;
        }

        console.log(`[ChopShop Daemon] Received render job (${message.id}): ${templateKey}`);

        const secureJobId = crypto.randomUUID();
        const ephemeralEnginePath = path.join(ENGINE_DIR, `chopshop_${secureJobId}.js`);

        try {
            // 1. Fetch engine payload from Worker & verify HMAC signature via Secret Manager
            const engineCode = await fetchVerifiedEngine();

            // 2. Write verified engine ephemerally with strict owner-only permissions
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

            // 3. Execute isolated render pipeline
            execFileSync(process.execPath, [ephemeralEnginePath], {
                stdio: 'inherit',
                env: envWithWorker,
                cwd: CHOPSHOP_ROOT
            });

            // 4. Acknowledge successful completion
            message.ack();
            console.log(`[ChopShop Daemon] Job ${message.id} completed and acknowledged.`);
        } catch (err) {
            console.error(`[ChopShop Daemon] Job ${message.id} failed:`, err.message);
            // Acknowledge on failure to prevent infinite Pub/Sub retry loops
            message.ack();
        } finally {
            if (fs.existsSync(ephemeralEnginePath)) {
                fs.unlinkSync(ephemeralEnginePath);
            }
        }
    });

    subscription.on('error', (error) => {
        console.error('[ChopShop Daemon] Pub/Sub stream error:', error.message);
    });
}

startDaemon();
