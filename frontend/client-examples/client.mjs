export class ApiError extends Error {
  constructor(status, payload) {
    super(payload?.error?.message || `API request failed (${status})`);
    this.name = 'ApiError';
    this.status = status;
    this.code = payload?.error?.code;
    this.requestId = payload?.error?.request_id;
    this.details = payload?.error?.details;
  }
}

/**
 * Browser client. Tokens remain in memory; never put them in localStorage or URLs.
 * A refresh is single-flight, and an expired request is retried only once.
 */
export class PanorafusClient {
  constructor(baseUrl, fetchImpl = globalThis.fetch) {
    const url = new URL(baseUrl);
    if (url.protocol !== 'https:' && !(
      url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    )) {
      throw new TypeError('Use HTTPS outside local development');
    }
    if (url.username || url.password || url.search || url.hash) {
      throw new TypeError('Base URL must not contain credentials, query parameters, or fragments');
    }
    this.baseUrl = url.href.replace(/\/$/, '');
    this.fetch = fetchImpl;
    this.accessToken = null;
    this.refreshToken = null;
    this.refreshing = null;
    this.authGeneration = 0;
  }

  clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
    this.authGeneration += 1;
  }

  async request(method, path, { body, query, signal, anonymous = false, retry = true } = {}) {
    if (typeof path !== 'string' || !/^\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(path)) {
      throw new TypeError('Use a relative API path without query parameters');
    }
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(query || {})) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const sentToken = this.accessToken;
    if (!anonymous && sentToken) headers.Authorization = ['Bearer', sentToken].join(' ');
    const response = await this.fetch(url, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
      signal, credentials: 'omit', cache: 'no-store', redirect: 'error'
    });
    if (response.status === 401 && !anonymous && retry && this.refreshToken) {
      if (sentToken === this.accessToken) await this.refresh();
      return this.request(method, path, { body, query, signal, anonymous, retry: false });
    }
    if (response.status === 204) return undefined;
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new ApiError(response.status, payload);
    return payload;
  }

  async register(input) {
    return this.request('POST', '/auth/register', { body: input, anonymous: true });
  }

  async login(email, password) {
    const generation = ++this.authGeneration;
    const result = await this.request('POST', '/auth/login', {
      body: { email, password }, anonymous: true
    });
    if (generation === this.authGeneration) {
      this.accessToken = result.access_token;
      this.refreshToken = result.refresh_token;
    }
    return result.user;
  }

  async refresh() {
    if (this.refreshing) return this.refreshing;
    if (!this.refreshToken) throw new ApiError(401, { error: { message: 'Login required' } });
    const generation = this.authGeneration;
    const token = this.refreshToken;
    this.refreshing = (async () => {
      try {
        const result = await this.request('POST', '/auth/refresh', {
          body: { refresh_token: token }, anonymous: true
        });
        if (generation !== this.authGeneration) throw new Error('Authentication changed during refresh');
        this.accessToken = result.access_token;
        this.refreshToken = result.refresh_token;
      } catch (error) {
        if (generation === this.authGeneration) this.clearTokens();
        throw error;
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }

  async logout() {
    const token = this.refreshToken;
    const access = this.accessToken;
    this.clearTokens();
    if (!token) return;
    const revoke = (accessToken, refreshToken) => this.fetch(`${this.baseUrl}/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(accessToken ? { Authorization: ['Bearer', accessToken].join(' ') } : {})
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
      credentials: 'omit', cache: 'no-store', redirect: 'error'
    });
    let response = await revoke(access, token);
    if (response.status === 401) {
      let replacement;
      try {
        replacement = await this.request('POST', '/auth/refresh', {
          body: { refresh_token: token }, anonymous: true
        });
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return;
        throw error;
      }
      response = await revoke(replacement.access_token, replacement.refresh_token);
    }
    if (!response.ok) {
      throw new ApiError(response.status, await response.json().catch(() => null));
    }
  }

  /**
   * Consume user-scoped SSE with Authorization headers (not token-bearing URLs).
   * Abort the stream on logout/navigation. Reconnect explicitly after expiry.
   */
  async notifications(onEvent, { signal } = {}) {
    if (!this.accessToken) throw new ApiError(401, { error: { message: 'Login required' } });
    const response = await this.fetch(`${this.baseUrl}/notifications/stream`, {
      headers: { Accept: 'text/event-stream', Authorization: ['Bearer', this.accessToken].join(' ') },
      signal, credentials: 'omit', cache: 'no-store', redirect: 'error'
    });
    if (!response.ok) throw new ApiError(response.status, await response.json().catch(() => null));
    if (!response.body) throw new Error('Streaming responses are unavailable');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let data = [];
    let event = 'message';
    let id;
    let frameSize = 0;
    const consume = (line) => {
      frameSize += line.length;
      if (frameSize > 1024 * 1024) throw new Error('Notification frame exceeds size limit');
      if (line === '') {
        if (data.length) onEvent({ event, id, data: JSON.parse(data.join('\n')) });
        data = [];
        event = 'message';
        frameSize = 0;
      } else if (!line.startsWith(':')) {
        const separator = line.indexOf(':');
        const field = separator === -1 ? line : line.slice(0, separator);
        const value = separator === -1 ? '' : line.slice(separator + 1).replace(/^ /, '');
        if (field === 'data') data.push(value);
        if (field === 'event') event = value;
        if (field === 'id') id = value;
      }
    };
    try {
      while (true) {
        const { done, value } = await reader.read();
        buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
        let match;
        while ((match = /\r\n|\r(?!$)|\n/.exec(buffer))) {
          consume(buffer.slice(0, match.index));
          buffer = buffer.slice(match.index + match[0].length);
        }
        if (buffer.length > 1024 * 1024) throw new Error('Notification frame exceeds size limit');
        if (done) break;
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
}

export const resourceId = (id) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new TypeError('Expected a UUID resource identifier');
  }
  return id;
};
