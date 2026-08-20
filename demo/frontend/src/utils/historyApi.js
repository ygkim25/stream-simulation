import axios from 'axios';
import { API_BASE_URL } from './apiConfig';

// IndexedDB엔 "오늘 00:00 이후" 데이터만 남겨둠 - 그 이전 기록은 백엔드 DB(히스토리 API)에서
// 받아오면 되므로 로컬엔 하루치 이상 쌓아둘 필요가 없음. 자정을 넘기면 자동으로 그 전날 로컬
// 기록이 정리 대상이 됨 (다음날 새 하루가 시작되며 다시 로컬에 쌓이기 시작함)
export const getTodayStartMs = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

// 백엔드 히스토리 내보내기 API가 받는 시간 형식 (yyyy-MM-dd'T'HH:mm:ss, 타임존 없이 서버와
// 동일한 로컬 시각 그대로 보냄 - 백엔드가 LocalDateTime으로 그대로 파싱함)
const formatLocalDateTime = (date) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

// 백엔드 히스토리 내보내기 응답(CSV, 쌍따옴표로 콤마/줄바꿈 포함 필드를 감싸는 표준 형식)을 파싱함
const parseCsv = (text) => {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.length > 0);
  if (lines.length === 0) return [];
  const headers = lines[0].split(',');
  return lines.slice(1).map(line => {
    const values = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQuotes) {
        if (c === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; } else { inQuotes = false; }
        } else {
          cur += c;
        }
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        values.push(cur);
        cur = '';
      } else {
        cur += c;
      }
    }
    values.push(cur);
    const row = {};
    headers.forEach((h, i) => { row[h] = values[i]; });
    return row;
  });
};

// 지정 구간의 온도/전력 히스토리를 백엔드에서 받아 로컬 레코드와 같은 형태
// ({equipId, temperature/power, status, receivedAt})로 맞춰줌. 백엔드는 "오늘/과거 구분 없이"
// DB에서 그대로 조회하므로 오늘 날짜 범위로도 호출 가능함 (웹소켓 연결이 끊겼던 동안 로컬
// IndexedDB에 못 쌓인 공백을 메울 때 사용)
export const fetchHistoryFromBackend = async (domain, fromDate, toDate, headers) => {
  const url = `${API_BASE_URL}/api/live/monitoring/${domain}/history/export?from=${encodeURIComponent(formatLocalDateTime(fromDate))}&to=${encodeURIComponent(formatLocalDateTime(toDate))}`;
  const res = await axios.get(url, { headers, responseType: 'text', transformResponse: [(data) => data] });
  const rows = parseCsv(res.data);
  return rows.map(row => ({
    equipId: row.equipId,
    temperature: domain === 'temp' && row.temperature !== '' ? Number(row.temperature) : undefined,
    power: domain === 'elec' && row.power !== '' ? Number(row.power) : undefined,
    status: row.status,
    // 백엔드의 "yyyy-MM-dd HH:mm:ss"는 일부 브라우저에서 Date 파싱이 불안정해 ISO로 맞춰줌
    receivedAt: row.recordedAt ? row.recordedAt.replace(' ', 'T') : null,
  }));
};
