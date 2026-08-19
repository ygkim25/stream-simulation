const BACKEND_PORT = 8086;
const HOST = typeof window !== 'undefined' ? window.location.hostname : 'localhost';

export const API_BASE_URL = `http://${HOST}:${BACKEND_PORT}`;
export const WS_BASE_URL = `ws://${HOST}:${BACKEND_PORT}`;
