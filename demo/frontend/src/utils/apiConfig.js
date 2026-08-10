// ==========================================
// 백엔드 서버 접속 주소 (프론트를 접속한 주소를 그대로 따라감)
// localhost로 접속했으면 localhost:8086, 10.23.128.46으로 접속했으면 10.23.128.46:8086으로 자동 매칭
// ==========================================
const BACKEND_PORT = 8086;
const HOST = typeof window !== 'undefined' ? window.location.hostname : 'localhost';

export const API_BASE_URL = `http://${HOST}:${BACKEND_PORT}`;
export const WS_BASE_URL = `ws://${HOST}:${BACKEND_PORT}`;
