const mongoose = require('mongoose');
const https = require('https');

const INITIAL_RETRY_DELAY_MS = 5000;
const MAX_RETRY_DELAY_MS = 30000;

const CONNECT_OPTIONS = {
    // How long the driver searches for a reachable Atlas server before failing.
    serverSelectionTimeoutMS: 10000,
    // TCP connection timeout to a single server.
    connectTimeoutMS: 10000,
    // Abort a socket that stays idle this long.
    socketTimeoutMS: 45000,
    // How often the driver checks cluster health for automatic reconnection.
    heartbeatFrequencyMS: 10000,
    maxPoolSize: 10,
    retryWrites: true,
    retryReads: true
};

let listenersRegistered = false;
let hasConnectedOnce = false;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function registerConnectionEvents() {
    if (listenersRegistered) return;
    listenersRegistered = true;

    mongoose.connection.on('disconnected', () => {
        if (!hasConnectedOnce) return;
        console.warn('[MongoDB] Disconnected from Atlas.');
        console.warn('[MongoDB] If this was not intentional, the driver will retry; Atlas may reject new connections until the current public IP is allowlisted.');
    });

    mongoose.connection.on('reconnected', () => {
        console.log('[MongoDB] Reconnected successfully.');
    });

    mongoose.connection.on('error', (error) => {
        console.error(`[MongoDB] Connection error: ${error.message}`);
    });
}

function fetchPublicIp(timeoutMs = 4000) {
    return new Promise((resolve) => {
        const request = https.get('https://api.ipify.org?format=json', { timeout: timeoutMs }, (response) => {
            if (response.statusCode !== 200) {
                response.resume();
                resolve(null);
                return;
            }

            let body = '';
            response.setEncoding('utf8');
            response.on('data', (chunk) => {
                if (body.length < 512) body += chunk;
            });
            response.on('end', () => {
                try {
                    resolve(JSON.parse(body).ip || null);
                } catch {
                    resolve(null);
                }
            });
        });

        request.on('timeout', () => {
            request.destroy();
            resolve(null);
        });
        request.on('error', () => resolve(null));
    });
}

function classifyConnectionError(error) {
    const message = String((error && error.message) || '');
    const name = String((error && error.name) || '');

    if (name === 'MongoParseError') {
        return { kind: 'invalid-uri', fatal: true };
    }

    if (
        (error && error.code === 18) ||
        /authentication failed|bad auth|auth failed|AuthenticationFailed/i.test(message)
    ) {
        return { kind: 'auth', fatal: true };
    }

    if (/ENOTFOUND|EAI_AGAIN/i.test(message)) {
        return { kind: 'dns', fatal: false };
    }

    if (/ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH/i.test(message)) {
        return { kind: 'network', fatal: false };
    }

    if (
        name === 'MongooseServerSelectionError' ||
        /whitelist|allowlist|not allowed|not authorized|Could not connect to any servers|server selection/i.test(message)
    ) {
        return { kind: 'allowlist-or-network', fatal: false };
    }

    return { kind: 'unknown', fatal: false };
}

async function printDiagnostics(reason, attempt) {
    console.error('');
    console.error(`[MongoDB] Connection attempt ${attempt} failed.`);

    if (reason.kind === 'auth') {
        console.error('[MongoDB] Atlas rejected the database username/password.');
        console.error('  - Check Atlas -> Database Access: the user exists and the password is current.');
        console.error('  - If the password contains @ : / ? # [ ] %, it must be URL-encoded inside MONGODB_URI.');
        console.error('  - Credentials belong only in backend/.env, never in frontend files or source code.');
        return;
    }

    if (reason.kind === 'invalid-uri') {
        console.error('[MongoDB] MONGODB_URI is not a valid connection string.');
        console.error('  - Expected format: mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/DBNAME?retryWrites=true&w=majority');
        return;
    }

    if (reason.kind === 'dns') {
        console.error('[MongoDB] The Atlas hostname could not be resolved.');
        console.error('  - Check that this machine has internet access and working DNS.');
        console.error('  - Try: nslookup cluster0.klzogu.mongodb.net');
        return;
    }

    if (reason.kind === 'allowlist-or-network') {
        console.error('[MongoDB] Atlas is refusing the connection at the network level.');
        console.error('  - The usual cause is MongoDB Atlas Network Access: your current public IP is not allowlisted.');
        console.error('  - Atlas validates the IP at connection time. Automatic reconnection cannot bypass this.');

        const publicIp = await fetchPublicIp();
        if (publicIp) {
            console.error('');
            console.error(`[MongoDB] This machine's current public IP is: ${publicIp}`);
            console.error(`[MongoDB] Add ${publicIp} in Atlas -> Network Access (Add IP Address).`);
        } else {
            console.error('  - Could not detect the public IP. Run: (Invoke-RestMethod https://api.ipify.org?format=json).ip');
        }

        console.error('');
        console.error('Atlas steps:');
        console.error('  1. Open https://cloud.mongodb.com and select your project.');
        console.error('  2. Go to Security -> Network Access.');
        console.error('  3. Click Add IP Address and enter the IP printed above (or a stable VPN/host egress IP).');
        console.error('  4. Save and wait 1-2 minutes for the change to propagate.');
        console.error('  5. Leave this server running; it retries automatically after the IP is allowed.');
        return;
    }

    console.error('[MongoDB] An unexpected connection error occurred.');
    console.error('  - Verify the cluster is running (not paused) and the network allows outbound TCP 27017.');
}

/**
 * Connect to MongoDB with bounded timeouts and automatic startup retries.
 *
 * The driver already reconnects automatically after an established connection
 * drops. This loop only covers the startup case, where Atlas may be blocking
 * the current public IP. It can never bypass Atlas IP allowlisting.
 */
const connectDB = async () => {
    const uri = process.env.MONGODB_URI;

    if (!uri) {
        throw new Error('MONGODB_URI is missing from backend/.env');
    }

    if (!/^mongodb(\+srv)?:\/\//i.test(uri)) {
        throw new Error('MONGODB_URI must start with mongodb:// or mongodb+srv://');
    }

    registerConnectionEvents();

    let attempt = 0;

    for (;;) {
        attempt++;
        console.log(`[MongoDB] Connecting to Atlas (attempt ${attempt})...`);

        try {
            const connection = await mongoose.connect(uri, CONNECT_OPTIONS);
            hasConnectedOnce = true;

            console.log('[MongoDB] Connected successfully.');
            console.log(`[MongoDB] Host: ${connection.connection.host}`);
            console.log(`[MongoDB] Database: ${connection.connection.name}`);

            return connection;
        } catch (error) {
            const reason = classifyConnectionError(error);
            await printDiagnostics(reason, attempt);

            if (reason.fatal) {
                throw error;
            }

            const maxAttempts = reason.kind === 'unknown' ? 3 : Infinity;
            if (attempt >= maxAttempts) {
                throw error;
            }

            if (mongoose.connection.readyState !== 0) {
                await mongoose.disconnect().catch(() => {});
            }

            const waitMs = Math.min(INITIAL_RETRY_DELAY_MS * 2 ** (attempt - 1), MAX_RETRY_DELAY_MS);
            console.warn(`[MongoDB] Retrying in ${Math.round(waitMs / 1000)}s...`);
            await delay(waitMs);
        }
    }
};

module.exports = connectDB;
