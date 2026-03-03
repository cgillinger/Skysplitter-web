/**
 * Skysplitter Web - Main Application Logic
 * Version: 2.0.0
 * Author: Christian Gillinger
 * License: MIT
 */

const MAX_POST_LENGTH = 300;
const RATE_LIMIT_DELAY = 2000;

class SkySplitter {
    constructor() {
        this.currentLink = null;
        this.currentPosts = [];
        this.currentUser = null;
        this.init();
    }

    async init() {
        try {
            const res = await fetch('/api/session');
            const data = await res.json();
            if (data.authenticated) {
                this.currentUser = data.user;
                this.showAppView();
            } else {
                this.showLoginView();
            }
            this.setupEventListeners();
        } catch (error) {
            console.error('Initialization error:', error);
            this.showLoginView();
        }
    }

    showAppView() {
        document.getElementById('loginView').classList.add('hidden');
        document.getElementById('appView').classList.remove('hidden');
        this.updateUserInfo();
    }

    showLoginView() {
        document.getElementById('loginView').classList.remove('hidden');
        document.getElementById('appView').classList.add('hidden');
    }

    async updateUserInfo() {
        if (!this.currentUser) return;

        let userInfoContainer = document.getElementById('userInfo');
        const textInputContainer = document.getElementById('textInput');

        if (!userInfoContainer && textInputContainer) {
            userInfoContainer = document.createElement('div');
            userInfoContainer.id = 'userInfo';
            textInputContainer.parentNode.insertBefore(userInfoContainer, textInputContainer);
        }

        if (userInfoContainer) {
            const avatarUrl = this.currentUser.avatar || '/assets/bluesky.png';

            userInfoContainer.innerHTML = `
                <div class="profile-container">
                    <img
                        src="${avatarUrl}"
                        alt="Profile"
                        class="profile-image"
                        onerror="this.src='/assets/bluesky.png'"
                    >
                    <div class="profile-info">
                        <span class="display-name">${this.currentUser.displayName || this.currentUser.handle}</span>
                        <span class="handle">@${this.currentUser.handle}</span>
                    </div>
                </div>
            `;
        }
    }

    setupEventListeners() {
        document.getElementById('auth-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleLogin(e);
        });

        const contentArea = document.getElementById('content');
        contentArea?.addEventListener('input', () => {
            this.updateCharCount(contentArea.value);
        });

        const linkInput = document.getElementById('linkInput');
        linkInput?.addEventListener('input', (e) => {
            this.validateLink(e.target.value);
        });

        document.getElementById('splitButton')?.addEventListener('click', () => {
            this.handleSplit();
        });

        document.getElementById('postButton')?.addEventListener('click', () => {
            this.handlePost();
        });

        const appView = document.getElementById('appView');
        if (appView) {
            const buttonContainer = document.createElement('div');
            buttonContainer.className = 'text-right mb-4';

            const logoutButton = document.createElement('button');
            logoutButton.textContent = 'Logout';
            logoutButton.className = 'bg-red-600 hover:bg-red-700';
            logoutButton.addEventListener('click', () => this.handleLogout());

            buttonContainer.appendChild(logoutButton);
            const textInput = document.getElementById('textInput');
            if (textInput) {
                textInput.parentNode.insertBefore(buttonContainer, textInput);
            }
        }
    }

    isValidUri(uri) {
        if (!uri || typeof uri !== 'string') return false;
        try {
            const url = new URL(uri);
            return ['http:', 'https:'].includes(url.protocol) && url.host.includes('.');
        } catch {
            return false;
        }
    }

    normalizeUri(uri) {
        if (!uri || typeof uri !== 'string') return null;
        try {
            return new URL(uri).toString().replace(/\/+$/, '');
        } catch {
            return null;
        }
    }

    validateLink(link) {
        const linkInput = document.getElementById('linkInput');
        if (!linkInput) return;

        if (!link) {
            linkInput.classList.remove('error');
            this.currentLink = null;
            return;
        }

        if (this.isValidUri(link)) {
            linkInput.classList.remove('error');
            this.currentLink = this.normalizeUri(link);
        } else {
            linkInput.classList.add('error');
            this.currentLink = null;
        }
    }

    async handleLogin(event) {
        const username = document.getElementById('username')?.value;
        const appPassword = document.getElementById('appPassword')?.value;

        if (!username || !appPassword) {
            this.showNotification('Both username and app password are required', 'error');
            return;
        }

        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identifier: username, password: appPassword })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            this.currentUser = data.user;
            this.showAppView();
            this.showNotification('Login successful!', 'success');
        } catch (error) {
            this.showNotification(`Login error: ${error.message}`, 'error');
        }
    }

    async handleLogout() {
        try {
            await fetch('/api/logout', { method: 'POST' });
            this.currentUser = null;
            const userInfo = document.getElementById('userInfo');
            if (userInfo) userInfo.remove();
            this.showLoginView();
            this.showNotification('Logged out successfully', 'success');
        } catch (error) {
            this.showNotification(`Logout error: ${error.message}`, 'error');
        }
    }

    updateCharCount(text) {
        const count = text ? text.length : 0;
        const charCount = document.getElementById('charCount');
        const splitButton = document.getElementById('splitButton');

        if (charCount) charCount.textContent = `${count} characters`;
        if (splitButton) splitButton.disabled = count === 0;
    }

    handleSplit() {
        const text = document.getElementById('content')?.value;
        if (!text) return;

        this.currentPosts = this.splitText(text);
        this.showPreview(this.currentPosts);
    }

    splitText(text) {
        // Split text into chunks where each chunk fits within maxPerChunk characters.
        const splitIntoChunks = (maxPerChunk) => {
            const words = text.split(' ');
            const chunks = [];
            let current = '';
            for (const word of words) {
                const joined = current ? `${current} ${word}` : word;
                if (joined.length <= maxPerChunk) {
                    current = joined;
                } else if (current) {
                    chunks.push(current);
                    current = word;
                } else {
                    // Single word longer than the limit — hard cut
                    chunks.push(word.substring(0, maxPerChunk));
                    current = word.substring(maxPerChunk);
                }
            }
            if (current) chunks.push(current);
            return chunks;
        };

        // Pass 1: rough split with a conservative 9-char suffix budget (" (99/99)").
        // This tells us approximately how many posts we'll have.
        const roughChunks = splitIntoChunks(MAX_POST_LENGTH - 9);

        // Pass 2: re-split using the exact suffix length for the estimated total,
        // e.g. " (18/18)" = 8 chars. This prevents any post from exceeding 300.
        const suffixBudget = roughChunks.length > 1
            ? ` (${roughChunks.length}/${roughChunks.length})`.length
            : 0;
        const chunks = splitIntoChunks(MAX_POST_LENGTH - suffixBudget);

        let posts = chunks.map(t => ({ text: t, link: null }));

        // Add link to the last post — must account for the suffix that will follow.
        if (this.currentLink && posts.length > 0) {
            const lastPost = posts[posts.length - 1];
            const linkWithSpace = ' ' + this.currentLink;

            if (lastPost.text.length + linkWithSpace.length + suffixBudget <= MAX_POST_LENGTH) {
                lastPost.text += linkWithSpace;
                lastPost.link = this.currentLink;
            } else {
                posts.push({ text: this.currentLink, link: this.currentLink });
            }
        }

        return posts.map((post, index) => ({
            ...post,
            text: posts.length > 1 ? `${post.text} (${index + 1}/${posts.length})` : post.text
        }));
    }

    showPreview(posts) {
        const previewArea = document.getElementById('previewArea');
        const postPreviews = document.getElementById('postPreviews');

        if (!previewArea || !postPreviews) return;

        previewArea.classList.remove('hidden');
        postPreviews.innerHTML = '';

        posts.forEach((post, index) => {
            const preview = document.createElement('div');
            preview.className = 'preview-item';

            const linkHtml = post.link
                ? `<div class="text-sm text-blue-500 mt-2">Contains link: ${post.link}</div>`
                : '';

            preview.innerHTML = `
                <div class="font-medium mb-2">Post ${index + 1} of ${posts.length}</div>
                <div class="mt-2 border-l-4 border-blue-500 pl-3">${post.text}</div>
                ${linkHtml}
                <div class="text-sm text-gray-500 mt-2">${post.text.length} characters</div>
            `;
            postPreviews.appendChild(preview);
        });
    }

    async handlePost() {
        if (!this.currentPosts.length) return;

        const postProgress = this.createProgressElement();

        try {
            let rootPost = null;
            let parentPost = null;

            for (let i = 0; i < this.currentPosts.length; i++) {
                const post = this.currentPosts[i];
                let reply = null;

                if (rootPost) {
                    reply = {
                        root: rootPost,
                        post: parentPost
                    };
                }

                const res = await fetch('/api/post', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        text: post.text,
                        link: post.link,
                        reply
                    })
                });
                const response = await res.json();
                if (!res.ok) throw new Error(response.error);

                if (i === 0) {
                    rootPost = {
                        uri: response.uri,
                        cid: response.cid
                    };
                }

                parentPost = {
                    uri: response.uri,
                    cid: response.cid
                };

                await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
                this.updateProgress(i + 1, this.currentPosts.length, postProgress);
            }

            this.showNotification('All posts created successfully!', 'success');
            this.resetUI();

        } catch (error) {
            this.showNotification(`Error: ${error.message}`, 'error');
        }
    }

    createProgressElement() {
        const previewArea = document.getElementById('previewArea');
        let progress = document.getElementById('postProgress');

        if (!progress && previewArea) {
            progress = document.createElement('div');
            progress.id = 'postProgress';
            progress.className = 'text-sm text-gray-600 mt-2 text-center';
            previewArea.appendChild(progress);
        }

        return progress;
    }

    updateProgress(current, total, progressElement) {
        if (progressElement) {
            progressElement.textContent = `Posted ${current} of ${total}`;
        }
    }

    resetUI() {
        const contentArea = document.getElementById('content');
        const previewArea = document.getElementById('previewArea');
        const linkInput = document.getElementById('linkInput');

        if (contentArea) contentArea.value = '';
        if (previewArea) previewArea.classList.add('hidden');
        if (linkInput) linkInput.value = '';

        this.currentPosts = [];
        this.currentLink = null;
        this.updateCharCount('');
    }

    showNotification(message, type) {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;

        document.body.appendChild(notification);
        setTimeout(() => {
            notification.remove();
        }, 5000);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.app = new SkySplitter();
});
