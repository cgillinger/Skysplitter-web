/**
 * Skysplitter Web - Bluesky API Client
 * Version: 2.0.0
 * Author: Christian Gillinger
 * License: MIT
 */

const { BskyAgent, RichText } = require('@atproto/api');

// Use native fetch (Node 18+) or fall back to node-fetch
const fetch = globalThis.fetch || require('node-fetch');

class BlueskyClient {
    constructor() {
        this.agent = new BskyAgent({
            service: 'https://bsky.social'
        });
        this.isAuthenticated = false;
        this.currentUser = null;
        this.debug = true;
        this.maxRetries = 3;
        this.retryDelay = 1000;
    }

    log(...args) {
        if (this.debug) {
            console.log('[BlueskyClient]', new Date().toISOString(), ...args);
        }
    }

    logError(...args) {
        if (this.debug) {
            console.error('[BlueskyClient ERROR]', new Date().toISOString(), ...args);
        }
    }

    async login(identifier, appPassword) {
        try {
            await this.agent.login({
                identifier,
                password: appPassword
            });

            this.isAuthenticated = true;
            await this.fetchCurrentUser();
            return true;
        } catch (error) {
            this.isAuthenticated = false;
            this.currentUser = null;

            if (error.status === 401) {
                throw new Error('Invalid username or password');
            } else if (error.status === 429) {
                throw new Error('Too many login attempts. Please try again later');
            } else {
                throw new Error(`Login failed: ${error.message || 'Unknown error'}`);
            }
        }
    }

    async fetchCurrentUser() {
        if (!this.agent.session?.did) {
            throw new Error('Not authenticated');
        }

        try {
            const response = await this.agent.getProfile({ actor: this.agent.session.did });
            this.currentUser = {
                handle: response.data.handle,
                displayName: response.data.displayName || response.data.handle,
                avatar: response.data.avatar,
                did: this.agent.session.did,
                description: response.data.description || '',
                followsCount: response.data.followsCount || 0,
                followersCount: response.data.followersCount || 0
            };
            return this.currentUser;
        } catch (error) {
            this.logError('Failed to fetch user profile:', error);
            throw new Error('Failed to fetch user profile. Please try logging in again.');
        }
    }

    async logout() {
        this.isAuthenticated = false;
        this.currentUser = null;
    }

    validateUri(uri) {
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
            const url = new URL(uri);
            return url.toString().replace(/\/+$/, '');
        } catch (error) {
            this.logError('URL normalization failed:', error);
            return null;
        }
    }

    async createPost(text, link = null, reply = null) {
        if (!this.isAuthenticated) {
            throw new Error('Not authenticated');
        }

        try {
            const rt = new RichText({ text });
            await rt.detectFacets(this.agent);

            const post = {
                text: rt.text,
                facets: rt.facets,
                createdAt: new Date().toISOString(),
                langs: ['en']
            };

            if (reply) {
                post.reply = {
                    root: reply.root || reply.post,
                    parent: reply.post
                };
            }

            let embedWarning = null;
            if (link && this.validateUri(link)) {
                try {
                    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
                        try {
                            const embedData = await this.createEmbed(link);
                            if (embedData) {
                                post.embed = embedData;
                                break;
                            }
                        } catch (embedError) {
                            const isLastAttempt = attempt === this.maxRetries - 1;
                            const status = embedError?.response?.status;

                            if (isLastAttempt) {
                                this.logError(`Embed creation failed (${status}):`, embedError);
                                embedWarning = this.getEmbedErrorMessage(status, new URL(link).hostname);
                            } else {
                                await new Promise(resolve =>
                                    setTimeout(resolve, this.retryDelay * Math.pow(2, attempt))
                                );
                            }
                        }
                    }
                } catch (embedError) {
                    this.logError('Embed creation failed:', embedError);
                    embedWarning = 'Link preview generation failed, but post will be created.';
                }
            }

            const response = await this.agent.post(post);
            return {
                success: true,
                uri: response.uri,
                cid: response.cid,
                warning: embedWarning
            };

        } catch (error) {
            this.logError('Post creation failed:', error);
            throw new Error(error.message || 'Failed to create post');
        }
    }

    getEmbedErrorMessage(status, domain) {
        switch (status) {
            case 403:
                return `Access denied while generating preview. Post will be created with link.`;
            case 404:
                return `Content not found. Post will be created with link.`;
            case 429:
                return `Rate limit exceeded. Post will be created with link.`;
            default:
                return `Preview generation failed (${status || 'unknown error'}). Post will be created with link.`;
        }
    }

    async createEmbed(url) {
        if (!url || !this.validateUri(url)) {
            this.log('Invalid URL for embed:', url);
            return null;
        }

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);

            const headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'DNT': '1',
                'Upgrade-Insecure-Requests': '1'
            };

            const response = await fetch(url, {
                headers,
                redirect: 'follow',
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw Object.assign(new Error(`HTTP ${response.status}: ${response.statusText}`), {
                    response
                });
            }

            const html = await response.text();
            if (!html) {
                throw new Error('Empty response received');
            }

            const metadata = {
                title: this.extractMetaContent(html, 'og:title') ||
                       this.extractMetaContent(html, 'title') ||
                       new URL(url).hostname,
                description: this.extractMetaContent(html, 'og:description') ||
                            this.extractMetaContent(html, 'description') ||
                            '',
                image: this.extractMetaContent(html, 'og:image')
            };

            const embedData = {
                $type: 'app.bsky.embed.external',
                external: {
                    uri: url,
                    title: metadata.title,
                    description: metadata.description
                }
            };

            if (metadata.image) {
                try {
                    const fullImageUrl = new URL(metadata.image, url).toString();
                    const imgResponse = await fetch(fullImageUrl, {
                        headers: {
                            ...headers,
                            'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
                        },
                        signal: controller.signal
                    });

                    if (imgResponse.ok) {
                        const arrayBuffer = await imgResponse.arrayBuffer();
                        const uint8Array = new Uint8Array(arrayBuffer);
                        const contentType = imgResponse.headers.get('content-type') || 'image/jpeg';

                        if (uint8Array.length <= 1000000) {
                            const upload = await this.agent.uploadBlob(uint8Array, {
                                encoding: contentType
                            });
                            if (upload?.data?.blob) {
                                embedData.external.thumb = upload.data.blob;
                            }
                        } else {
                            this.log('Image too large:', uint8Array.length, 'bytes');
                        }
                    }
                } catch (imageError) {
                    this.logError('Failed to process thumbnail:', imageError);
                }
            }

            return embedData;
        } catch (error) {
            if (error.name === 'AbortError') {
                this.logError('Fetch timeout for URL:', url);
                throw new Error('Request timed out');
            }
            throw error;
        }
    }

    extractMetaContent(html, name) {
        if (!html) return null;

        try {
            const ogPattern = new RegExp(`<meta[^>]*(?:property|name)=["'](?:${name}|og:${name})["'][^>]*content=["']([^"']+)["']`, 'i');
            const ogMatch = html.match(ogPattern);
            if (ogMatch) return this.sanitizeMetaContent(ogMatch[1]);

            const metaPattern = new RegExp(`<meta[^>]*name=["']${name}["'][^>]*content=["']([^"']+)["']`, 'i');
            const metaMatch = html.match(metaPattern);
            if (metaMatch) return this.sanitizeMetaContent(metaMatch[1]);

            if (name === 'title') {
                const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
                if (titleMatch) return this.sanitizeMetaContent(titleMatch[1]);
            }

            return null;
        } catch (error) {
            this.logError('Meta content extraction failed:', error);
            return null;
        }
    }

    sanitizeMetaContent(content) {
        if (!content) return null;
        return content
            .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#x27;/g, "'")
            .replace(/\s+/g, ' ')
            .trim();
    }
}

module.exports = BlueskyClient;
