import axios from 'axios';

// ==========================================
// 시뮬레이션 시나리오 백엔드 API (simulation_scenario 테이블, 유저별 소유권 분리)
// ==========================================
const BASE_URL = 'http://localhost:8086/api/simulation/scenarios';

const authHeaders = (token) => (token ? { Authorization: `Bearer ${token}` } : {});

// rows[].time은 백엔드에 JSON 텍스트로 저장/반환되므로 문자열로 오는 걸 Date로 복원
const hydrateScenario = (scenario) => ({
  ...scenario,
  rows: (scenario.rows || []).map(r => ({ ...r, time: r.time ? new Date(r.time) : null })),
});

// 목록 조회 (id / fileName / uploadedAt만, rows는 미포함)
export const listScenarios = async (token) => {
  const response = await axios.get(BASE_URL, { headers: authHeaders(token) });
  return response.data || [];
};

// 상세 조회 (rows 포함)
export const getScenarioDetail = async (id, token) => {
  const response = await axios.get(`${BASE_URL}/${id}`, { headers: authHeaders(token) });
  return hydrateScenario(response.data);
};

// 신규 시나리오 업로드
export const uploadScenario = async (fileName, rows, token) => {
  const response = await axios.post(BASE_URL, { fileName, rows }, { headers: authHeaders(token) });
  return hydrateScenario(response.data);
};

// 기존 시나리오의 rows만 수정
export const updateScenarioRows = async (id, rows, token) => {
  const response = await axios.put(`${BASE_URL}/${id}`, { rows }, { headers: authHeaders(token) });
  return hydrateScenario(response.data);
};

export const deleteScenarioApi = async (id, token) => {
  await axios.delete(`${BASE_URL}/${id}`, { headers: authHeaders(token) });
};

// 시나리오 이름 변경 (id는 body로 전달)
export const renameScenarioApi = async (id, fileName, token) => {
  const response = await axios.patch(`${BASE_URL}/rename`, { id, fileName }, { headers: authHeaders(token) });
  return response.data;
};
