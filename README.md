<div align="center">

<img src="assets/bluesky.png" alt="Skysplitter" width="80" />

# Skysplitter Web

**Split and post long text as threaded posts to Bluesky — directly from your browser.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-brightgreen?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Bluesky](https://img.shields.io/badge/Bluesky-AT%20Protocol-0285FF?logo=bluesky&logoColor=white)](https://bsky.social)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![GitHub last commit](https://img.shields.io/github/last-commit/cgillinger/Skysplitter-web)](https://github.com/cgillinger/Skysplitter-web/commits)

</div>

---

## ✨ Features

| | |
|---|---|
| 🔀 **Automatic splitting** | Breaks long text into posts of max 300 characters |
| 🧵 **Thread numbering** | Adds (1/5), (2/5), etc. to keep threads organized |
| 🖼️ **Link preview cards** | Fetches OpenGraph metadata for rich link embeds |
| 🔗 **Thread continuity** | Each post correctly replies to the previous one |
| 🌙 **Dark mode** | Follows your OS preference automatically |
| 📱 **Responsive design** | Works on desktop and mobile browsers |
| 🔒 **Persistent sessions** | Login survives server restarts — no need to re-authenticate |
| 🍪 **Secure cookies** | Server-side sessions with httpOnly cookies |

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18.0.0
- A [Bluesky App Password](https://bsky.app/settings/app-passwords) *(never use your main password)*

### Installation

```bash
git clone https://github.com/cgillinger/Skysplitter-web.git
cd Skysplitter-web
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🐳 Docker

### Quick start

```bash
docker run -d \
  -p 3000:3000 \
  -v skysplitter-sessions:/app/sessions \
  -e SESSION_SECRET=your-secret-here \
  --name skysplitter \
  ghcr.io/cgillinger/skysplitter-web
```

### docker-compose

```yaml
services:
  skysplitter:
    image: ghcr.io/cgillinger/skysplitter-web
    ports:
      - "3000:3000"
    environment:
      SESSION_SECRET: your-secret-here   # change this!
      SESSION_DIR: /data/sessions
    volumes:
      - sessions:/data/sessions
    restart: unless-stopped

volumes:
  sessions:
```

> **Note:** Mount the sessions directory as a volume so logins survive container restarts and updates.

### Build locally

```bash
docker build -t skysplitter-web .
docker run -d -p 3000:3000 -v skysplitter-sessions:/app/sessions skysplitter-web
```

---

## ⚙️ Configuration

All configuration is done via environment variables.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port the server listens on |
| `SESSION_SECRET` | `skysplitter-default-secret-change-me` | Secret used to sign session cookies — **always set this in production** |
| `SESSION_DIR` | `./sessions` | Directory where session files are stored (mount as Docker volume) |

### Example

```bash
PORT=8080 SESSION_SECRET=a-long-random-string SESSION_DIR=/var/lib/skysplitter/sessions node server.js
```

---

## 📖 How It Works

1. **Login** with your Bluesky handle and an [App Password](https://bsky.app/settings/app-passwords)
2. **Write** your long text in the text area
3. **Add a link** *(optional)* — attached to the last post with a preview card
4. **Split** — preview how your text will be divided into posts
5. **Post Thread** — publishes all posts as a connected thread on Bluesky

---

## 🏗️ Architecture

```
Browser (client)          Express Server               Bluesky (AT Protocol)
┌──────────────┐         ┌──────────────────────┐     ┌──────────────────┐
│  index.html  │         │   server.js           │     │                  │
│  app.js      │◄──────►│   ├── /api/session     │────►│  bsky.social     │
│  styles.css  │  fetch  │   ├── /api/login       │     │                  │
└──────────────┘         │   ├── /api/logout      │     └──────────────────┘
                         │   └── /api/post        │
                         │                        │
                         │   bluesky.js           │     Session files (disk)
                         │   (ATProtocol client)  │     ┌──────────────────┐
                         │                        │────►│  ./sessions/*.json│
                         └──────────────────────┘      └──────────────────┘
```

- **Client** — handles UI, text splitting, and link validation
- **Server** — Bluesky auth, session management, post creation, link preview generation
- **Session files** — persist login tokens across server restarts; each file holds the Bluesky refresh token for one browser session

---

## 🔐 Security

- Uses **App Passwords** only — your main Bluesky password never touches this app
- Credentials are handled **server-side only** — never stored or logged in the browser
- Sessions use **httpOnly cookies** that can't be read by JavaScript
- Bluesky **refresh tokens** (not passwords) are stored in session files — tokens can be revoked at any time from [bsky.app/settings/app-passwords](https://bsky.app/settings/app-passwords)
- Set a strong `SESSION_SECRET` and keep the sessions directory private

---

## 📄 License

MIT — [Christian Gillinger](https://github.com/cgillinger)
