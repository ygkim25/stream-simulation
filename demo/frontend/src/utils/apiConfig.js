// 백엔드 서버 접속 주소
// 로컬에서 다른 호스트/포트로 붙으려면 frontend/.env.local에 VITE_API_HOST, VITE_API_PORT를 설정 (git에 안 올라감)
const HOST = import.meta.env.VITE_API_HOST || '10.23.128.46';
const BACKEND_PORT = import.meta.env.VITE_API_PORT || 8086;

export const API_BASE_URL = `http://${HOST}:${BACKEND_PORT}`;
export const WS_BASE_URL = `ws://${HOST}:${BACKEND_PORT}`;
