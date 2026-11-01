// Local development uses the separate .NET port; installed builds use a same-origin /api proxy.
const localHost = typeof location !== 'undefined' &&
	(location.hostname === 'localhost' || location.hostname === '127.0.0.1');
export const API_URL = localHost ? 'http://localhost:5000' : '';

// Only used for the live price preview on the product form. The API calculates the real VAT.
export const VAT_RATE = 0.15;
