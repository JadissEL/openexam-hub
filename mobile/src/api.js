import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { API_BASE } from './config.js';

function urlFor(path) {
  if (/^https?:\/\//.test(path)) return path;
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

export async function apiSend(method, path, { body, token, timeout = 30000 } = {}) {
  const url = urlFor(path);
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.request({
      url,
      method,
      headers,
      data: body,
      connectTimeout: timeout,
      readTimeout: timeout
    });
    const data = res.data && typeof res.data === 'object' ? res.data : {};
    if (res.status >= 400) {
      const err = new Error(data.error || `Request failed (${res.status})`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const apiGet = (path) => apiSend('GET', path);
export const apiPost = (path, body, token, timeout) => apiSend('POST', path, { body, token, timeout });
