import * as XLSX from 'xlsx';

// 엑셀 헤더가 조금씩 달라도 인식할 수 있도록 후보 이름들 중 첫 매치를 사용
const pickField = (row, candidates) => {
  for (const key of candidates) {
    if (row[key] !== undefined && row[key] !== '') return row[key];
  }
  return undefined;
};

// 실시간 모니터링 화면의 "엑셀 내보내기" 결과물과 동일한 형식: "2026. 8. 6. 오후 12:58:00"
const KOREAN_DATETIME_RE = /^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(오전|오후)\s*(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

const parseTimeValue = (raw) => {
  if (raw instanceof Date && !isNaN(raw.getTime())) return raw;
  if (typeof raw === 'number') {
    // 엑셀 날짜 직렬값(예: 45678.5) 변환
    const parsed = XLSX.SSF.parse_date_code(raw);
    if (parsed) {
      return new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H || 0, parsed.M || 0, parsed.S || 0);
    }
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    const m = trimmed.match(KOREAN_DATETIME_RE);
    if (m) {
      const [, y, mo, d, period, h, mi, s] = m;
      let hour = parseInt(h, 10);
      if (period === '오전') {
        if (hour === 12) hour = 0;
      } else if (hour !== 12) {
        hour += 12;
      }
      return new Date(Number(y), Number(mo) - 1, Number(d), hour, Number(mi), s ? Number(s) : 0);
    }
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return null;
};

// 백엔드(EquipmentStatusService.determineStatus)와 동일한 임계값 판정 규칙
export const computeStatus = (temperature, threshold) => {
  if (temperature == null || threshold == null || isNaN(temperature) || isNaN(threshold)) return '정상';
  if (temperature >= threshold * 1.1) return '위험';
  if (temperature >= threshold) return '경고';
  return '정상';
};

export const isWarningStatus = (status) => status === '경고' || status === '위험';

// 업로드한 File(.xlsx)을 읽어 { equipId, equipName, temperature, power, threshold, status, time } 배열로 정규화
// (실시간 모니터링 화면의 "엑셀 내보내기" 형식: ID / 설비명 / 수신 시간 / 온도(℃) / 전력 / 임계값(온도) / 상태)
export const parseSimulationFile = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(e.target.result, { type: 'array', cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        let missingTimeCount = 0;

        const rows = rawRows.map((row, idx) => {
          const rawId = pickField(row, ['ID', '설비ID', '설비 ID', 'equipId']) ?? '';
          const equipId = String(rawId).replace(/^#/, '').trim();
          const equipName = String(pickField(row, ['설비명', 'equipName']) ?? '').trim();
          const location = String(pickField(row, ['위치', 'location']) ?? '').trim();
          const temperature = Number(pickField(row, ['온도(℃)', '온도', 'temperature']));
          const power = Number(pickField(row, ['전력', 'power']));
          const threshold = Number(pickField(row, ['임계값(온도)', '임계값', '임계치', 'threshold']));
          const explicitStatus = pickField(row, ['상태', 'status']);
          const timeRaw = pickField(row, ['수신 시간', '수신시간', '최초수신시간', '시간', 'time', 'Time']);
          let time = parseTimeValue(timeRaw);

          if (!time) {
            missingTimeCount += 1;
            // 시간 정보가 없는 행은 업로드 순서 기준 2초 간격으로 임시 배정 (재생 흐름이 끊기지 않도록)
            time = new Date(Date.now() + idx * 2000);
          }

          return {
            equipId,
            equipName,
            location,
            temperature,
            power,
            threshold,
            status: ['정상', '경고', '위험'].includes(explicitStatus) ? explicitStatus : computeStatus(temperature, threshold),
            time,
          };
        }).filter(r => r.equipId);

        rows.sort((a, b) => a.time.getTime() - b.time.getTime());

        resolve({ rows, missingTimeCount, totalCount: rawRows.length });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
};

// 밀리초 -> "mm:ss" 표기
export const formatMmSs = (ms) => {
  if (!ms || ms < 0 || !isFinite(ms)) return '00:00';
  const totalSec = Math.floor(ms / 1000);
  const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const ss = String(totalSec % 60).padStart(2, '0');
  return `${mm}:${ss}`;
};
