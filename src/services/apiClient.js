'use strict';

const { validateHttpUrl } = require('../utils/validation');

class ApiClient {
    constructor(options = {}) {
        this.fetch = options.fetch || globalThis.fetch;
        if (typeof this.fetch !== 'function') {
            throw new TypeError('A Fetch API implementation is required.');
        }
        this.baseUrl = options.baseUrl ? validateHttpUrl(options.baseUrl, 'Base URL') : null;
        this.headers = { ...(options.headers || {}) };
    }

    async request(endpoint, options = {}) {
        const url = this.baseUrl
            ? new URL(endpoint, this.baseUrl)
            : validateHttpUrl(endpoint);
        const response = await this.fetch(url, {
            ...options,
            headers: { ...this.headers, ...(options.headers || {}) }
        });
        const body = await response.text();

        if (!response.ok) {
            throw new Error(`HTTP ${response.status} ${response.statusText}: ${body}`);
        }
        if (!body) {
            return null;
        }

        try {
            return JSON.parse(body);
        } catch (error) {
            throw new Error('The API response was not valid JSON.', { cause: error });
        }
    }

    get(endpoint, options = {}) {
        return this.request(endpoint, { ...options, method: 'GET' });
    }

    post(endpoint, data, options = {}) {
        return this.request(endpoint, {
            ...options,
            method: 'POST',
            headers: { 'content-type': 'application/json', ...(options.headers || {}) },
            body: JSON.stringify(data)
        });
    }
}

module.exports = { ApiClient };
