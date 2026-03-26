import { config } from '../config.js';

// In-memory token cache — survives the lifetime of the process
let tokenCache = null;

async function getToken() {
  // Return cached token if it has more than 60 seconds left
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.token;
  }

  const res = await fetch(`${config.keetaBaseUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'app_level_token',
      client_id: config.keetaClientId,
      client_secret: config.keetaClientSecret,
    }),
  });

  if (!res.ok) {
    throw new Error(`Keeta auth failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return tokenCache.token;
}

async function keetaRequest(method, path) {
  const token = await getToken();
  const res = await fetch(`${config.keetaBaseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`Keeta API error ${res.status}: ${text}`);
    err.status = res.status;
    throw err;
  }

  return res.json();
}

export const keetaService = {
  confirmOrder: (orderId) => keetaRequest('POST', `/v1/orders/${orderId}/confirm`),
  readyForPickup: (orderId) => keetaRequest('POST', `/v1/orders/${orderId}/readyForPickup`),
  requestCancellation: (orderId) => keetaRequest('POST', `/v1/orders/${orderId}/requestCancellation`),
  acceptRefund: (orderId) => keetaRequest('POST', `/v1/orders/${orderId}/acceptRefund`),
  rejectRefund: (orderId) => keetaRequest('POST', `/v1/orders/${orderId}/rejectRefund`),
};
