import * as XLSX from 'xlsx';

// 엑셀 헤더가 조금씩 달라도 인식할 수 있도록 후보 이름들 중 첫 매치를 사용
const pickField = (row, candidates) => {
  for (const key of candidates) {
    if (row[key] !== undefined && row[key] !== '') return row[key];
  }
  return undefined;
};

// 컬럼 자체가 없거나(온도만 있는 시나리오의 전력처럼) 값이 '-' 같은 자리표시자라 숫자로 안 바뀌면
// undefined를 반환함 (Number(undefined)는 NaN이라 "값이 없음"과 구분이 안 되는 문제가 있었음)
const pickNumberField = (row, candidates) => {
  const raw = pickField(row, candidates);
  if (raw === undefined) return undefined;
  const num = Number(raw);
  return Number.isNaN(num) ? undefined : num;
};

// 실시간 모니터링 화면의 "엑셀 내보내기" 결과물과 동일한 형식.
// "2026.8.14 16:09:32"(현재 형식, 24시간제)와 "2026.8.14 오전 9:32:39" / "2026. 8. 6. 오후 12:58:00"
// (오전/오후 쓰던 예전 형식, 이미 내보내진 예전 파일과의 호환을 위해) 다 인식함
const KOREAN_DATETIME_RE = /^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?\s*(?:(오전|오후)\s*)?(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

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
      // period가 없으면 이미 24시간제 값이라 그대로 씀
      if (period === '오전') {
        if (hour === 12) hour = 0;
      } else if (period === '오후' && hour !== 12) {
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

// 온도 데이터가 있으면 온도 기준으로, 온도가 아예 없는(전력만 있는) 시나리오는 전력 기준으로 판정함
export const computeCombinedStatus = (temperature, threshold, power, powerThreshold) => (
  temperature != null ? computeStatus(temperature, threshold) : computeStatus(power, powerThreshold)
);

export const isWarningStatus = (status) => status === '경고' || status === '위험';

// XLSX 파싱 + 행 정규화(무거운 CPU 작업) 자체를 담당하는 순수 함수. 워커 안에서도, 워커를
// 못 쓰는 환경의 메인 스레드 폴백에서도 이 함수 하나를 그대로 재사용함
export const parseWorkbookBuffer = (arrayBuffer) => {
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  let missingTimeCount = 0;

  const rows = rawRows.map((row, idx) => {
    const rawId = pickField(row, ['ID', '설비ID', '설비 ID', 'equipId']) ?? '';
    const equipId = String(rawId).replace(/^#/, '').trim();
    const equipName = String(pickField(row, ['설비명', 'equipName']) ?? '').trim();
    const location = String(pickField(row, ['위치', 'location']) ?? '').trim();
    const temperature = pickNumberField(row, ['온도(℃)', '온도', 'temperature']);
    const power = pickNumberField(row, ['전력', 'power']);
    const threshold = pickNumberField(row, ['임계값(온도)', '임계값', '임계치', 'threshold']);
    const powerThreshold = pickNumberField(row, ['전력임계값', '전력 임계값', '임계값(전력)', 'powerThreshold']);
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
      powerThreshold,
      status: computeCombinedStatus(temperature, threshold, power, powerThreshold),
      // 온도/전력이 둘 다 있는 행은 status가 온도 기준으로만 판정되므로, 전력 임계값 초과를
      // 독립적으로 감지(전력 알람 발생)하려면 전력만의 상태를 따로 들고 있어야 함
      powerStatus: computeStatus(power, powerThreshold),
      time,
    };
  }).filter(r => r.equipId);

  rows.sort((a, b) => a.time.getTime() - b.time.getTime());

  return { rows, missingTimeCount, totalCount: rawRows.length };
};

// 업로드한 File(.xlsx)을 읽어 { equipId, equipName, location, temperature, power, threshold,
// powerThreshold, status, powerStatus, time } 배열로 정규화. 헤더 후보는 실시간 모니터링의
// "엑셀 내보내기" 결과물(온도/전력 중 하나만 있거나 둘 다 있는 경우 모두)과 호환됨.
// 파일을 읽기만 하고, 무거운 파싱은 Web Worker(parseSimulationFileInWorker)에 맡기는 걸 권장 -
// 이 함수는 워커를 쓸 수 없는 경우를 위한 메인 스레드 폴백으로 남겨둠
export const parseSimulationFile = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        resolve(parseWorkbookBuffer(e.target.result));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
};

// 일주일치 같은 대용량 엑셀은 XLSX.read/sheet_to_json + 행 변환이 전부 CPU 작업이라, 메인
// 스레드에서 돌리면 그동안 로딩 스피너조차 못 그려질 정도로 화면이 완전히 멈춤. Web Worker에서
// 파싱해서 메인 스레드(화면)는 계속 반응하게 함
export const parseSimulationFileInWorker = (file) => {
  return new Promise((resolve, reject) => {
    if (typeof Worker === 'undefined') {
      // 워커를 지원하지 않는 환경이면 메인 스레드에서라도 동작은 하도록 폴백
      parseSimulationFile(file).then(resolve, reject);
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const worker = new Worker(new URL('../workers/simulationFileWorker.js', import.meta.url), { type: 'module' });
      worker.onmessage = (msg) => {
        worker.terminate();
        if (msg.data?.ok) resolve(msg.data.result);
        else reject(new Error(msg.data?.error || '엑셀 파싱 실패'));
      };
      worker.onerror = (err) => {
        worker.terminate();
        reject(err);
      };
      worker.postMessage(e.target.result, [e.target.result]);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
};

// 밀리초 -> "mm:ss" (1시간 넘으면 "h:mm:ss") 표기. 일주일치처럼 경과 시간이 긴 시나리오는
// 분(mm)이 두 자리를 넘어가서 "1156:06"처럼 알아보기 힘든 표기가 되는 걸 막음
export const formatMmSs = (ms) => {
  if (!ms || ms < 0 || !isFinite(ms)) return '00:00';
  const totalSec = Math.floor(ms / 1000);
  const hh = Math.floor(totalSec / 3600);
  const mm = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
  const ss = String(totalSec % 60).padStart(2, '0');
  return hh > 0 ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`;
};

// Date -> "HH:mm:ss" 표기 (엑셀의 실제 수신 시간을 그대로 보여줄 때 사용)
export const formatClockTime = (date) => {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) return '--:--:--';
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
};
