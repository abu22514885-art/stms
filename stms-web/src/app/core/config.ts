// Address of the .NET API.
// Local: the http://localhost:PORT that the API prints when it starts (must match launchSettings.json).
// Online: the address Render gives your API (no trailing slash).
const LOCAL_API = 'http://localhost:5080';
const ONLINE_API = 'https://stms-u21w.onrender.com';   // render

export const API_URL = location.hostname === 'localhost' ? LOCAL_API : ONLINE_API;

// Only used for the live price preview on the product form. The API calculates the real VAT.
export const VAT_RATE = 0.15;