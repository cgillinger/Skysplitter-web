# Skysplitter Web

Split and post long text as threaded posts to [Bluesky](https://bsky.social) — directly from your browser.

![Skysplitter](assets/bluesky.png)

## Features

- **Automatic text splitting** — Breaks long text into posts of max 300 characters
- **Thread numbering** — Adds (1/5), (2/5), etc. to keep threads organized
- **Link preview cards** — Fetches OpenGraph metadata for rich link embeds
- **Thread continuity** — Each post correctly replies to the previous one
- **Dark mode** — Follows your OS preference automatically
- **Responsive design** — Works on desktop and mobile browsers
- **Secure sessions** — Server-side session management with httpOnly cookies

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18.0.0

### Installation

```bash
git clone https://github.com/cgillinger/Skysplitter-web.git
cd Skysplitter-web
npm install
```

### Run

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `PORT` | `3000` | Server port |
| `SESSION_SECRET` | Auto-generated | Secret for session encryption |
| `NODE_ENV` | — | Set to `production` for secure cookies |

Example:

```bash
PORT=8080 SESSION_SECRET=my-secret-key node server.js
```

## How It Works

1. **Login** with your Bluesky handle and an [App Password](https://bsky.app/settings/app-passwords)
2. **Write** your long text in the text area
3. **Add a link** (optional) — it will be attached to the last post with a preview card
4. **Split** — preview how your text will be divided into posts
5. **Post Thread** — publishes all posts as a connected thread on Bluesky

## Architecture

```
Browser (client)          Express Server
┌──────────────┐         ┌──────────────────┐
│  index.html  │         │   server.js       │
│  app.js      │◄──────►│   ├── /api/session │
│  styles.css  │  fetch  │   ├── /api/login   │
└──────────────┘         │   ├── /api/logout  │
                         │   └── /api/post    │
                         │                    │
                         │  bluesky.js        │
                         │  (ATProtocol API)  │
                         └──────────────────┘
```

- **Client** handles UI, text splitting, and link validation
- **Server** handles Bluesky authentication, session management, post creation, and link preview generation

## Security

- Uses **App Passwords** only — never your main Bluesky password
- Credentials are handled **server-side only** — never stored in the browser
- Sessions use **httpOnly cookies** that can't be accessed by JavaScript
- Delete your App Password at [bsky.app/settings/app-passwords](https://bsky.app/settings/app-passwords) when you're done

## License

MIT — Christian Gillinger
