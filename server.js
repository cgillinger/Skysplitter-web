/**
 * Skysplitter Web - Server
 * Version: 2.0.0
 * Author: Christian Gillinger
 * License: MIT
 */

const express = require('express');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const compression = require('compression');
const path = require('path');
const BlueskyClient = require('./src/api/bluesky');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_DIR = process.env.SESSION_DIR || path.join(__dirname, 'sessions');

// In-memory cache of authenticated Bluesky clients, keyed by session ID.
// Rebuilt automatically from persisted tokens when the server restarts.
const clients = new Map();

app.use(compression());
app.use(express.json());

if (!process.env.SESSION_SECRET) {
    console.warn('Warning: SESSION_SECRET not set. Using a fixed fallback secret. Set SESSION_SECRET in production.');
}

app.use(session({
    store: new FileStore({
        path: SESSION_DIR,
        ttl: 86400,    // seconds — matches cookie maxAge
        retries: 1,
        logFn: () => {} // suppress verbose file-store logging
    }),
    secret: process.env.SESSION_SECRET || 'skysplitter-default-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Serve static assets
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use(express.static(path.join(__dirname, 'src/client')));

// Returns a live BlueskyClient for the request's session.
// If the server restarted and the in-memory cache is empty, the client is
// reconstructed from the Bluesky tokens stored in the persisted session file.
async function getOrReconstructClient(req) {
    let client = clients.get(req.sessionID);
    if (client && client.isAuthenticated) return client;

    if (req.session.bskySession) {
        client = new BlueskyClient();
        await client.resumeSession(req.session.bskySession);
        client.currentUser = req.session.currentUser;
        // Save refreshed tokens back so the session file stays up to date
        req.session.bskySession = client.agent.session;
        clients.set(req.sessionID, client);
        return client;
    }

    return null;
}

// Auth middleware
async function requireAuth(req, res, next) {
    if (!req.session.authenticated) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
        const client = await getOrReconstructClient(req);
        if (!client) {
            req.session.authenticated = false;
            return res.status(401).json({ error: 'Session expired' });
        }
        req.blueskyClient = client;
        next();
    } catch (error) {
        req.session.authenticated = false;
        req.session.bskySession = null;
        return res.status(401).json({ error: 'Session expired, please log in again' });
    }
}

// --- API Routes ---

// Check current session
app.get('/api/session', async (req, res) => {
    if (!req.session.authenticated) {
        return res.json({ authenticated: false });
    }

    try {
        const client = await getOrReconstructClient(req);
        if (client) {
            res.json({ authenticated: true, user: client.currentUser });
        } else {
            req.session.authenticated = false;
            res.json({ authenticated: false });
        }
    } catch (error) {
        req.session.authenticated = false;
        req.session.bskySession = null;
        res.json({ authenticated: false });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
        return res.status(400).json({ error: 'Username and app password are required' });
    }

    try {
        const client = new BlueskyClient();
        await client.login(identifier, password);
        clients.set(req.sessionID, client);
        req.session.authenticated = true;
        req.session.bskySession = client.agent.session;
        req.session.currentUser = client.currentUser;
        res.json({
            success: true,
            user: client.currentUser
        });
    } catch (error) {
        res.status(401).json({ error: error.message });
    }
});

// Logout
app.post('/api/logout', (req, res) => {
    clients.delete(req.sessionID);
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Logout failed' });
        }
        res.json({ success: true });
    });
});

// Create a single post
app.post('/api/post', requireAuth, async (req, res) => {
    const { text, link, reply } = req.body;
    if (!text) {
        return res.status(400).json({ error: 'Text is required' });
    }

    try {
        const result = await req.blueskyClient.createPost(text, link, reply);
        res.json(result);
    } catch (error) {
        console.error('[/api/post] createPost failed:', error);
        res.status(500).json({ error: error.message });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Skysplitter web running at http://localhost:${PORT}`);
    console.log(`Session files stored in: ${SESSION_DIR}`);
});
