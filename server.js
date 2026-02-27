/**
 * Skysplitter Web - Server
 * Version: 2.0.0
 * Author: Christian Gillinger
 * License: MIT
 */

const express = require('express');
const session = require('express-session');
const compression = require('compression');
const crypto = require('crypto');
const path = require('path');
const BlueskyClient = require('./src/api/bluesky');

const app = express();
const PORT = process.env.PORT || 3000;

// In-memory store for authenticated Bluesky clients, keyed by session ID
const clients = new Map();

app.use(compression());
app.use(express.json());

app.use(session({
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Serve static assets
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use(express.static(path.join(__dirname, 'src/client')));

// Auth middleware
function requireAuth(req, res, next) {
    if (!req.session.authenticated) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    const client = clients.get(req.sessionID);
    if (!client || !client.isAuthenticated) {
        req.session.authenticated = false;
        return res.status(401).json({ error: 'Session expired' });
    }
    next();
}

// --- API Routes ---

// Check current session
app.get('/api/session', (req, res) => {
    if (req.session.authenticated && clients.has(req.sessionID)) {
        const client = clients.get(req.sessionID);
        res.json({
            authenticated: true,
            user: client.currentUser
        });
    } else {
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
        const client = clients.get(req.sessionID);
        const result = await client.createPost(text, link, reply);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Skysplitter web running at http://localhost:${PORT}`);
});
