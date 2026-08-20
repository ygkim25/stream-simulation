import React, { useState, useEffect, useMemo, useRef } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { Client } from '@stomp/stompjs';
import Header from '../components/Header';
import AlarmSidebar from '../components/AlarmSidebar';
import CustomAlert from '../components/CustomAlert';
import CustomConfirm from '../components/CustomConfirm';
import EquipmentHistoryModal from '../components/EquipmentHistoryModal';
import EquipmentTrendGrid from '../components/EquipmentTrendGrid';
import Dropdown from '../components/Dropdown';
import Checkbox from '../components/Checkbox';
import DateTimePicker from '../components/DateTimePicker';
import EquipTimelineBar from '../components/EquipTimelineBar';
import { saveToDB, getByDateRangeFromDB, getByDateRangeIndexedFromDB, pruneOldRecordsFromDB, backfillReceivedAtMsIfNeeded } from '../utils/indexedDb';
import { formatKoreanDateTime } from '../utils/dateFormat';
import { formatClockTime } from '../utils/simulationParse';
import { STATUS_STYLES, getStatusMeta } from '../utils/statusStyles';
import { compareByEquipId, STATUS_SORT_ORDER } from '../utils/sortHelpers';
import { API_BASE_URL, WS_BASE_URL } from '../utils/apiConfig';

// 화면에 표시할 알람 최대 개수
const MAX_ALARMS = 100;
const MAX_LOGS = 500;
// IndexedDB엔 "오늘 00:00 이후" 데이터만 남겨둠 - 그 이전 기록은 백엔드 DB(히스토리 API)에서
// 받아오면 되므로 로컬엔 하루치 이상 쌓아둘 필요가 없음. 자정을 넘기면 자동으로 그 전날 로컬
// 기록이 정리 대상이 됨 (다음날 새 하루가 시작되며 다시 로컬에 쌓이기 시작함)
const getTodayStartMs = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const PRUNE_INTERVAL_MS = 30 * 60 * 1000; // 30분마다 한 번씩만 정리(자주 할 필요 없음)

// "전체 흐름"이 새로고침 직후 빈 상태로 안 보이게, 마지막 계산 결과를 동기적으로 읽을 수 있는
// localStorage에 캐싱함 (IndexedDB 조회는 비동기라 첫 페인트 전엔 못 끝남). v2: 캐시 형태를
// {equipId: {temperature, power}}로 바꾸며 키도 같이 바꿈 (안 바꾸면 예전 캐시가 안 읽혀 텅 비어 보임)
const TIMELINE_CACHE_KEY = 'realtimeTimelineCacheV2';

const loadCachedTimelines = () => {
  try {
    return JSON.parse(localStorage.getItem(TIMELINE_CACHE_KEY)) || null;
  } catch {
    return null;
  }
};

const saveCachedTimelines = (result) => {
  try {
    localStorage.setItem(TIMELINE_CACHE_KEY, JSON.stringify(result));
  } catch {
    // localStorage를 못 쓰는 환경(프라이빗 모드 등)이면 캐싱 없이 그냥 조회 결과만 사용
  }
};

// 설비 하나에 대해 [{time, color}] 목록을, 시간순 색 구간(전체 흐름 바에 그대로 넘길 수 있는 형태)으로 변환
const buildTimelineSegments = (byEquip, startMs, endMs) => {
  const result = {};
  byEquip.forEach((list, equipId) => {
    const sorted = [...list].sort((a, b) => a.time - b.time);
    const segments = [];
    sorted.forEach((point, idx) => {
      // 첫 구간은 실제 데이터 시작 시각이 아니라 창의 맨 처음(startMs)부터 채워서, 설비마다
      // 데이터 보유량이 달라도 막대 전체 길이가 항상 똑같이(100%) 보이게 함
      const segStart = idx === 0 ? startMs : point.time;
      const segEnd = idx < sorted.length - 1 ? sorted[idx + 1].time : endMs;
      const widthPct = ((segEnd - segStart) / (endMs - startMs)) * 100;
      if (widthPct <= 0) return;
      const last = segments[segments.length - 1];
      if (last && last.color === point.color) {
        last.widthPct += widthPct;
      } else {
        segments.push({ color: point.color, widthPct });
      }
    });
    result[equipId] = segments;
  });
  return result;
};

// 기간 선택 팝오버의 "빠른 선택" 프리셋 목록
const PRESET_OPTIONS = [
  { value: 'FULL_1HR', label: '최근 1시간' },
  { value: 'FIRST_30M', label: '이전 30분' },
  { value: 'LAST_30M', label: '최근 30분' },
  { value: 'RESET_NOW', label: '현재로 갱신' },
];

// 상태 필터 키 <-> 상태 라벨 매핑 (필터 버튼 클릭 시 getStatusMeta().label과 비교하는 데 사용)
const STATUS_FILTER_LABELS = { normal: '정상', warning: '경고', danger: '위험' };

// 상태 필터 버튼 목록과, 선택됐을 때(active) 상태별 강조 색상
const STATUS_FILTER_OPTIONS = [
  { key: 'all', label: '전체' },
  { key: 'normal', label: '정상' },
  { key: 'warning', label: '경고' },
  { key: 'danger', label: '위험' },
];
const STATUS_FILTER_ACTIVE_CLASS = {
  all: { dark: 'bg-[#232B45] border-[#2A335A] text-[#EDF1FC]', light: 'bg-gray-200 border-gray-300 text-gray-800' },
  normal: { dark: 'bg-[#34D399]/15 border-[#34D399]/40 text-[#34D399]', light: 'bg-green-50 border-green-300 text-green-700' },
  warning: { dark: 'bg-amber-400/15 border-amber-400/40 text-amber-400', light: 'bg-amber-50 border-amber-300 text-amber-600' },
  danger: { dark: 'bg-[#FB5D75]/15 border-[#FB5D75]/40 text-[#FB5D75]', light: 'bg-red-50 border-red-300 text-red-600' },
};

// 백엔드가 온도/전력을 완전히 별개 도메인(threshold/status 필드명이 겹침)으로 내려주므로,
// 한 행으로 합칠 때 전력 쪽은 powerThreshold/powerStatus로 이름을 바꿔서 온도 값과 안 섞이게 함
const EMPTY_EQUIP_ROW = { temperature: null, threshold: null, status: null, power: null, powerThreshold: null, powerStatus: null };
const mergeTempDto = (row, dto) => ({
  ...row,
  equipId: dto.equipId,
  equipName: dto.equipName,
  location: dto.location,
  receivedAt: dto.receivedAt,
  temperature: dto.temperature,
  threshold: dto.threshold,
  status: dto.status,
});
const mergeElecDto = (row, dto) => ({
  ...row,
  equipId: dto.equipId,
  equipName: dto.equipName,
  location: dto.location,
  receivedAt: dto.receivedAt,
  power: dto.power,
  powerThreshold: dto.threshold,
  powerStatus: dto.status,
});
// 같은 equipId의 온도/전력 응답 목록을 한 행씩으로 합쳐서 반환 (초기 목록 조회 시 사용)
const mergeEquipmentLists = (tempList, elecList) => {
  const byId = new Map();
  tempList.forEach(dto => {
    byId.set(dto.equipId, mergeTempDto({ ...EMPTY_EQUIP_ROW }, dto));
  });
  elecList.forEach(dto => {
    const existing = byId.get(dto.equipId) || { ...EMPTY_EQUIP_ROW };
    byId.set(dto.equipId, mergeElecDto(existing, dto));
  });
  return [...byId.values()];
};

// 온도/전력 API를 Promise.all로 묶으면 하나만 실패해도 둘 다 날아가고 느린 쪽 때문에 빠른 쪽도
// 늦게 뜸 - 각 요청을 독립 처리해 먼저 온 쪽부터 바로 반영. "둘 다 끝난 뒤"가 필요한 호출부를 위해
// 두 요청이 모두 끝나는 Promise도 반환함
const fetchBothDomains = (tempUrl, elecUrl, headers, onUpdate) => {
  let tempData;
  let elecData;
  const emit = () => {
    if (tempData !== undefined || elecData !== undefined) {
      onUpdate(tempData || [], elecData || []);
    }
  };
  const tempPromise = axios.get(tempUrl, { headers })
    .then(res => { tempData = res.data || []; })
    .catch(err => { console.error(`요청 실패 (${tempUrl}):`, err); tempData = tempData ?? []; })
    .finally(emit);
  const elecPromise = axios.get(elecUrl, { headers })
    .then(res => { elecData = res.data || []; })
    .catch(err => { console.error(`요청 실패 (${elecUrl}):`, err); elecData = elecData ?? []; })
    .finally(emit);
  return Promise.all([tempPromise, elecPromise]);
};

// 엑셀 내보내기에서 백엔드 히스토리 조회에 쓰는 시간 형식 (yyyy-MM-dd'T'HH:mm:ss, 타임존 없이 서버와
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

// 로컬 보관 기간(오늘 00:00 이후)보다 오래된 구간은 IndexedDB에 없으므로, 백엔드 히스토리 CSV에서
// 가져와서 로컬 레코드와 같은 형태({equipId, temperature/power, status, receivedAt})로 맞춰줌
const fetchHistoryFromBackend = async (domain, fromDate, toDate, headers) => {
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

// ==========================================
// 실시간 모니터링 화면 컴포넌트
// ==========================================
const RealtimeScreen = ({
  user,
  route,
  setRoute,
  openMyPage,
  alarms = [],
  setAlarms,
  setLogs,
  openLogs,
  isDarkMode,
  setIsDarkMode,
  isAlarmOn,
  setIsAlarmOn
}) => {
  const [tabMode, setTabMode] = useState('stream');
  // 온도/전력을 완전히 분리된 탭으로 봄 (값/임계값/상태 컬럼이 탭에 따라 통째로 바뀜)
  const [metricTab, setMetricTab] = useState('temperature'); // 'temperature' | 'power'
  const [selectedEquipId, setSelectedEquipId] = useState(null);
  const isAdmin = user?.role === 'ADMIN' || user?.userId === 'admin';
  // 설비 클릭 시 온도/전력 히스토리 차트 팝업에 띄울 설비 ID
  const [historyEquipId, setHistoryEquipId] = useState(null);
  // 추이 카드에서 특정 그래프(온도/전력)만 클릭해서 들어온 경우, 해당 그래프만 크게 보여주기 위한 값
  const [historyMetric, setHistoryMetric] = useState(null);
  // ID / 설비명 검색어
  const [equipSearch, setEquipSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'normal' | 'warning' | 'danger'

  // 표 헤더 클릭 정렬 (null이면 ID 오름차순 기본 정렬)
  const [sortColumn, setSortColumn] = useState(null);
  const [sortDirection, setSortDirection] = useState('asc');
  const handleSortClick = (column) => {
    if (sortColumn === column) {
      setSortDirection(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // 크롬 기본 alert 대신 사용하는 커스텀 알림 메시지
  const [alertMessage, setAlertMessage] = useState('');
  const showAlert = (message) => setAlertMessage(message);

  // 크롬 기본 confirm 대신 사용하는 커스텀 확인 메시지
  const [confirmMessage, setConfirmMessage] = useState('');
  const [confirmCallback, setConfirmCallback] = useState(null);
  const askConfirm = (message, onConfirm) => {
    setConfirmMessage(message);
    setConfirmCallback(() => onConfirm);
  };
  const handleConfirmYes = () => {
    const callback = confirmCallback;
    setConfirmMessage('');
    setConfirmCallback(null);
    callback?.();
  };
  const handleConfirmNo = () => {
    setConfirmMessage('');
    setConfirmCallback(null);
  };

  const [equipments, setEquipments] = useState([]);
  // 온도/전력 둘 다 최초 로딩이 끝나기 전까지는 "확실히 비어있음"과 구분해서 로딩 문구를 계속 보여줌
  // (먼저 온 쪽만 반영하면 반쪽 데이터가 잠깐 보였다가 갱신되는 게 거슬린다는 피드백으로 추가함)
  const [hasLoadedEquipmentsOnce, setHasLoadedEquipmentsOnce] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [loadError, setLoadError] = useState('');
  // 설정 탭 (설비명/위치/임계값(온도)/임계값(전력))
  const [editedFields, setEditedFields] = useState({});

  // 바뀐행 하이라이트
  const [flashedIds, setFlashedIds] = useState(() => new Set());

  // 시작 시각 & 종료 시각 State (기본값: 올해 1월 1일 ~ 현재)
  const [startTime, setStartTime] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), 0, 1, 0, 0, 0);
  });
  const [endTime, setEndTime] = useState(() => new Date());
  const [isRangeEditorOpen, setIsRangeEditorOpen] = useState(false);

  const [selectedPreset, setSelectedPreset] = useState('');
  // 엑셀 내보내기 시 온도/전력을 각각 포함할지 (체크박스 - 최소 하나는 항상 선택돼 있어야 함)
  const [exportIncludeTemp, setExportIncludeTemp] = useState(true);
  const [exportIncludePower, setExportIncludePower] = useState(true);

  const stompClientRef = useRef(null);
  const gridScrollRef = useRef(null);

  // 알림 매핑용 최신 설비명/위치 ref. useEffect 미러링은 웹소켓 연타 시 한 렌더 뒤처져 상태
  // 전환 오탐지가 생길 수 있어, 웹소켓 핸들러에서 직접 동기적으로 갱신함
  const equipmentsRef = useRef([]);

  // 짧은 시간에 상태 전환이 연달아 발생해도 noti-warn/logs 조회는 한 번으로 묶어서 보내기 위한 디바운스
  const alertsFetchTimeoutRef = useRef(null);
  const scheduleAlertsFetch = () => {
    if (alertsFetchTimeoutRef.current) return; // 이미 예약돼 있으면 추가로 예약하지 않음
    alertsFetchTimeoutRef.current = setTimeout(() => {
      alertsFetchTimeoutRef.current = null;
      fetchAlerts();
      fetchLogs();
    }, 3000);
  };
  useEffect(() => {
    return () => {
      if (alertsFetchTimeoutRef.current) clearTimeout(alertsFetchTimeoutRef.current);
    };
  }, []);

  // 사용자가 개별 삭제(x)한 알람 id 목록 (새로고침해도 유지되도록 localStorage에 보관)
  const dismissedAlarmIdsRef = useRef(null);
  if (dismissedAlarmIdsRef.current === null) {
    try {
      const saved = localStorage.getItem('dismissedAlarmIds');
      dismissedAlarmIdsRef.current = new Set(saved ? JSON.parse(saved) : []);
    } catch (e) {
      dismissedAlarmIdsRef.current = new Set();
    }
  }
  const persistDismissedAlarmIds = () => {
    try {
      localStorage.setItem('dismissedAlarmIds', JSON.stringify([...dismissedAlarmIdsRef.current]));
    } catch (e) {
      console.error('알람 삭제 목록 저장 실패:', e);
    }
  };

  // 알람 클릭 시 그리드에서 스크롤 이동 + 배경색으로 표시할 설비 ID
  const [clickHighlightId, setClickHighlightId] = useState(null);
  const clickHighlightTimeoutRef = useRef(null);
  useEffect(() => {
    return () => {
      if (clickHighlightTimeoutRef.current) clearTimeout(clickHighlightTimeoutRef.current);
    };
  }, []);

  const handleAlarmClick = (alarm) => {
    const rowEl = document.getElementById(`equip-row-${alarm.equipId}`);
    if (rowEl) {
      rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    setClickHighlightId(alarm.equipId);
    if (clickHighlightTimeoutRef.current) clearTimeout(clickHighlightTimeoutRef.current);
    clickHighlightTimeoutRef.current = setTimeout(() => {
      setClickHighlightId(null);
    }, 1500);
  };

  const handleDismissAlarm = (id) => {
    dismissedAlarmIdsRef.current.add(id);
    persistDismissedAlarmIds();
    setAlarms(prev => prev.filter(a => a.id !== id));
  };

  // 위험 알람 브라우저 알림 - id 기반으로 "이미 본 것"을 추적하는 방식은 켜고 끄는 타이밍과
  // 얽히면서 계속 문제가 반복됐음(꺼도 계속 오거나, 다시 켜면 밀린 게 쏟아지거나). 그 대신 훨씬
  // 단순하고 확실한 기준을 씀: 알람을 "켠 시각" 이후에 실제로 발생한(recordedAt) 것만 알려주고,
  // 그 전부터 쌓여있던 건 절대 알림 대상이 아님 - 켤 때마다 밀린 게 쏟아질 일 자체가 없음
  const notifiedAlarmIdsRef = useRef(new Set());
  const isAlarmOnRef = useRef(isAlarmOn);
  const alarmEnabledAtMsRef = useRef(isAlarmOn ? new Date().getTime() : null);
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);
  useEffect(() => {
    alarmEnabledAtMsRef.current = isAlarmOn ? new Date().getTime() : null;
    isAlarmOnRef.current = isAlarmOn;
  }, [isAlarmOn]);
  const notifyDangerAlarms = (dangerAlarms) => {
    const canNotify = isAlarmOnRef.current && alarmEnabledAtMsRef.current != null
      && typeof Notification !== 'undefined' && Notification.permission === 'granted';
    if (!canNotify) return;
    dangerAlarms.forEach(a => {
      if (a.recordedAtMs == null || a.recordedAtMs <= alarmEnabledAtMsRef.current) return;
      if (notifiedAlarmIdsRef.current.has(a.id)) return;
      notifiedAlarmIdsRef.current.add(a.id);
      new Notification(`⚠ ${a.equipName} 위험`, {
        body: `${a.metric === 'power' ? '전력' : '온도'} ${a.value} (기준 ${a.threshold}) - ${a.location}`,
      });
    });
  };

  // receivedAtMs 인덱스 도입 이전 기록들을 백그라운드에서 채워 넣음 (앱을 막지 않도록 fire-and-forget,
  // 이미 끝났으면 내부적으로 바로 스킵됨)
  useEffect(() => {
    backfillReceivedAtMsIfNeeded().catch(err => {
      console.error('receivedAtMs 백필 실패:', err);
    });
  }, []);

  // 브라우저 로컬 기록(IndexedDB) 정리 - 오래된 데이터를 계속 지워서 저장소가 무한정 커지는 것을
  // 막음 (안 지우면 시간이 지날수록 조회들이 갈수록 느려짐). 마운트 시 한 번 + 30분마다 반복
  useEffect(() => {
    const prune = () => {
      pruneOldRecordsFromDB(getTodayStartMs()).catch(err => {
        console.error('로컬 기록 정리 실패:', err);
      });
    };
    prune();
    const intervalId = setInterval(prune, PRUNE_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, []);

  // 웹소켓 연결
  useEffect(() => {
    let isMounted = true;

    const setupWebSocket = async () => {
      // 기존 클라이언트가 살아있다면 해제 후 재연결
      if (stompClientRef.current) {
        stompClientRef.current.deactivate();
      }

      const client = new Client({
        brokerURL: `${WS_BASE_URL}/ws/websocket`,

        connectHeaders: {
          Authorization: user?.token ? `Bearer ${user.token}` : '',
          token: user?.token || '',
        },
        reconnectDelay: 5000,
        
        onConnect: () => {
          if (!isMounted) return;
          setIsConnected(true);
          setLoadError('');

          // 초기목록
          fetchEquipments();
          fetchAlerts();
          fetchLogs();

          // 온도/전력 실시간 틱 핸들러. 도메인이 분리돼 있어 기존 행을 통째로 덮어쓰지 않고
          // 해당 도메인 필드만 갱신해야 다른 쪽 값이 안 날아감
          const handleLiveMessage = (domain) => async (message) => {
            if (!isMounted) return;

            try {
              const parsedData = JSON.parse(message.body);

              let newDataList = [];
              if (Array.isArray(parsedData)) {
                newDataList = parsedData;
              } else if (parsedData && Array.isArray(parsedData.data)) {
                newDataList = parsedData.data;
              } else if (parsedData) {
                newDataList = [parsedData];
              }

              if (newDataList.length > 0) {
                const mergeDto = domain === 'temp' ? mergeTempDto : mergeElecDto;
                const statusField = domain === 'temp' ? 'status' : 'powerStatus';

                // 실시간 스트림에서 상태 전환(정상↔경고/위험)이 감지되면 noti-warn/logs를 재조회함
                // (짧은 시간에 여러 건이 몰려도 scheduleAlertsFetch가 한 번으로 묶어서 요청함)
                let hasTransition = false;
                const updated = [...equipmentsRef.current];
                newDataList.forEach(dto => {
                  const idx = updated.findIndex(eq => eq.equipId === dto.equipId);
                  const prevStatus = idx >= 0 ? updated[idx][statusField] : undefined;
                  if (idx >= 0 && dto.status !== prevStatus) {
                    hasTransition = true;
                  }
                  if (idx >= 0) {
                    updated[idx] = mergeDto(updated[idx], dto);
                  } else {
                    updated.push(mergeDto({ ...EMPTY_EQUIP_ROW }, dto));
                  }
                });
                equipmentsRef.current = updated;

                if (hasTransition) {
                  scheduleAlertsFetch();
                }

                // 설비 ID로 비교해서 변경된 로우만 갱신 (전체 목록을 덮어쓰지 않음)
                setEquipments(updated);

                // 값이 바뀐 설비(행)만 잠깐 하이라이트
                const changedIds = newDataList.map(item => item.equipId);
                setFlashedIds(prev => new Set([...prev, ...changedIds]));
                setTimeout(() => {
                  if (!isMounted) return;
                  setFlashedIds(prev => {
                    const next = new Set(prev);
                    changedIds.forEach(id => next.delete(id));
                    return next;
                  });
                }, 500);

                await saveToDB(newDataList);
              }
            } catch (e) {
              console.error('웹소켓 데이터 파싱 에러:', e);
            }
          };

          client.subscribe('/topic/live/monitoring/temp', handleLiveMessage('temp'));
          client.subscribe('/topic/live/monitoring/elec', handleLiveMessage('elec'));
        },

        onStompError: (frame) => {
          if (!isMounted) return;
          console.error('STOMP 에러:', frame.headers['message']);
          setLoadError('STOMP 프로토콜 오류');
          setIsConnected(false);
        },

        onWebSocketClose: () => {
          if (isMounted) setIsConnected(false);
        }
      });

      client.activate();
      stompClientRef.current = client;
    };

    setupWebSocket();

    return () => {
      isMounted = false;
      if (stompClientRef.current) {
        stompClientRef.current.deactivate();
        stompClientRef.current = null;
      }
    };
  }, [user?.token]); // user 객체 대신 user?.token을 전달하여 불필요한 재연결 및 중복 구독 차단

  // 알림 전체 지우기 (백엔드 noti-warn 이력도 온도/전력 둘 다 초기화해야 재조회 시 다시 나타나지 않음)
  // 지금 보고 있는 지표(온도/전력)의 알람만 지움 - 다른 지표 알람은 그대로 둠
  const handleClearAlarms = async (metric = metricTab) => {
    const isTemp = metric === 'temperature';
    try {
      const headers = { Authorization: `Bearer ${user.token}` };
      await axios.post(
        `${API_BASE_URL}/api/live/monitoring/${isTemp ? 'temp' : 'elec'}/noti-warn/clear`,
        {},
        { headers }
      );
    } catch (err) {
      console.error('알람 초기화 실패:', err);
    }
    setAlarms(prev => prev.filter(a => (a.metric || 'temperature') !== metric));
  };

  // 임계값 탭에 "진입할 때"(또는 온도/전력 탭을 전환할 때) 값 세팅 (equipments를 deps에 넣으면
  // 실시간 웹소켓 업데이트가 올 때마다 이 effect가 다시 돌면서 입력 중이던 값을 덮어써버림)
  useEffect(() => {
    if (tabMode === 'threshold') {
      const initialMap = {};
      equipments.forEach(eq => {
        initialMap[eq.equipId] = {
          equipName: eq.equipName ?? '',
          location: eq.location ?? '',
          threshold: (metricTab === 'temperature' ? eq.threshold : eq.powerThreshold) ?? '',
        };
      });
      setEditedFields(initialMap);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabMode, metricTab]);

  // 시간 프리셋 조절 함수
  const handlePresetRange = (presetType) => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    if (presetType === 'FULL_1HR') {
      setStartTime(oneHourAgo);
      setEndTime(now);
    } else if (presetType === 'FIRST_30M') {
      setStartTime(oneHourAgo);
      setEndTime(new Date(now.getTime() - 30 * 60 * 1000));
    } else if (presetType === 'LAST_30M') {
      setStartTime(new Date(now.getTime() - 30 * 60 * 1000));
      setEndTime(now);
    } else if (presetType === 'RESET_NOW') {
      setStartTime(oneHourAgo);
      setEndTime(now);
    }
    setSelectedPreset(presetType);
  };

  // 시작 시간 변경 처리
  const handleStartTimeChange = (selectedStart) => {
    if (selectedStart > endTime) {
      showAlert('시작 시각은 종료 시각보다 나중일 수 없습니다.');
      return;
    }
    setStartTime(selectedStart);
    setSelectedPreset(''); // 수동으로 시간을 바꾸면 프리셋 선택 표시 해제
  };

  // 종료 시간 변경 처리
  const handleEndTimeChange = (selectedEnd) => {
    if (selectedEnd < startTime) {
      showAlert('종료 시각은 시작 시각보다 빠를 수 없습니다.');
      return;
    }
    setEndTime(selectedEnd);
    setSelectedPreset(''); // 수동으로 시간을 바꾸면 프리셋 선택 표시 해제
  };

  // 엑셀 내보내기 (선택한 자유 시간 범위 데이터 추출)
  // 로컬 보관 기간(오늘 00:00 이후) 안쪽은 IndexedDB에서, 그보다 오래된 구간은 백엔드 히스토리에서 가져와 합침
  const handleExport = async () => {
    if (startTime >= endTime) {
      showAlert('시작 시각은 종료 시각보다 빨라야 합니다.');
      return;
    }

    try {
      const startMs = startTime.getTime();
      const endMs = endTime.getTime();
      const cutoffMs = getTodayStartMs();

      // 요청 구간 중 오늘 자정 이후와 겹치는 부분은 IndexedDB에서
      let localData = [];
      if (endMs > cutoffMs) {
        const localStartMs = Math.max(startMs, cutoffMs);
        localData = await getByDateRangeFromDB(localStartMs, endMs);
      }

      // 24시간보다 오래된 부분은 백엔드 히스토리 CSV에서, 온도/전력 독립 조회로 한쪽이 실패해도
      // 성공한 쪽은 그대로 포함시킴 (Promise.all이면 하나만 실패해도 둘 다 날아감)
      const needsTemp = exportIncludeTemp;
      const needsPower = exportIncludePower;
      let backendData = [];
      if (startMs < cutoffMs) {
        const backendEndMs = Math.min(endMs, cutoffMs);
        const headers = user?.token ? { Authorization: `Bearer ${user.token}` } : {};
        const equipInfoById = new Map(equipmentsRef.current.map(eq => [String(eq.equipId), eq]));
        // 히스토리 원본엔 설비명/위치/임계값이 없어서 현재 설비 목록으로 채워 넣음 (과거 임계값은
        // 저장돼있지 않아 현재 값으로 대체, 참고용)
        const enrich = (rows) => rows.map(r => {
          const info = equipInfoById.get(String(r.equipId));
          const fallbackThreshold = r.temperature != null ? info?.threshold : info?.powerThreshold;
          return {
            ...r,
            equipName: info?.equipName ?? r.equipId,
            location: info?.location ?? '-',
            threshold: r.threshold ?? fallbackThreshold ?? null,
          };
        });
        const [tempResult, elecResult] = await Promise.allSettled([
          needsTemp ? fetchHistoryFromBackend('temp', startTime, new Date(backendEndMs), headers) : Promise.resolve([]),
          needsPower ? fetchHistoryFromBackend('elec', startTime, new Date(backendEndMs), headers) : Promise.resolve([]),
        ]);
        if (tempResult.status === 'fulfilled') backendData.push(...enrich(tempResult.value));
        else if (needsTemp) console.error('온도 히스토리 조회 실패:', tempResult.reason);
        if (elecResult.status === 'fulfilled') backendData.push(...enrich(elecResult.value));
        else if (needsPower) console.error('전력 히스토리 조회 실패:', elecResult.reason);
        if ((needsTemp && tempResult.status === 'rejected') || (needsPower && elecResult.status === 'rejected')) {
          showAlert('과거 데이터(서버 보관분) 중 일부 조회에 실패했습니다. 나머지 데이터로 내보냅니다.');
        }
      }

      // 체크 해제한 지표가 있으면 로컬 데이터에서도 그 지표 기록은 제외함
      const combinedRecords = [...localData, ...backendData]
        .filter(r => (r.temperature != null && needsTemp) || (r.power != null && needsPower))
        .sort((a, b) => {
          const at = a.receivedAt ? new Date(a.receivedAt).getTime() : 0;
          const bt = b.receivedAt ? new Date(b.receivedAt).getTime() : 0;
          return at - bt;
        });

      if (combinedRecords.length === 0) {
        const startStr = formatKoreanDateTime(startTime);
        const endStr = formatKoreanDateTime(endTime);
        showAlert(`지정한 시간 구간 (${startStr} ~ ${endStr}) 내 수신 데이터가 없습니다.`);
        return;
      }

      // 온도/전력이 독립적으로 기록돼 한 행에 한쪽 값만 있는 경우가 많음 - equipId별 시간순으로
      // 훑으며 값이 없는 쪽은 마지막 알려진 값을 이어붙여 한 행에 같이 보이도록 합침
      const byEquip = new Map();
      combinedRecords.forEach(r => {
        if (!byEquip.has(r.equipId)) byEquip.set(r.equipId, []);
        byEquip.get(r.equipId).push(r);
      });
      const mergedRows = [];
      byEquip.forEach((list) => {
        let lastTemp = null;
        let lastTempThreshold = null;
        let lastTempStatus = null;
        let lastPower = null;
        let lastPowerThreshold = null;
        let lastPowerStatus = null;
        list.forEach(r => {
          if (r.temperature != null) { lastTemp = r.temperature; lastTempThreshold = r.threshold; lastTempStatus = r.status; }
          if (r.power != null) { lastPower = r.power; lastPowerThreshold = r.threshold; lastPowerStatus = r.status; }
          mergedRows.push({
            equipId: r.equipId,
            equipName: r.equipName,
            location: r.location,
            receivedAt: r.receivedAt,
            temperature: lastTemp,
            tempThreshold: lastTempThreshold,
            tempStatus: lastTempStatus,
            power: lastPower,
            powerThreshold: lastPowerThreshold,
            powerStatus: lastPowerStatus,
          });
        });
      });

      // 선택한 지표에 해당하는 컬럼만 넣음 (둘 다 선택했으면 온도/전력 컬럼을 모두 포함)
      const exportData = mergedRows.map(eq => {
        const row = {
          'ID': `#${String(eq.equipId).padStart(3, '0')}`,
          '설비명': eq.equipName,
          '위치': eq.location || '-',
          '수신 시간': eq.receivedAt ? formatKoreanDateTime(eq.receivedAt) : '-',
        };
        if (needsTemp) {
          row['온도'] = eq.temperature != null ? Number(eq.temperature).toFixed(1) : '-';
          row['임계값(온도)'] = eq.tempThreshold ?? '-';
          row['상태(온도)'] = eq.tempStatus ? getStatusMeta(eq.tempStatus).label : '-';
        }
        if (needsPower) {
          row['전력'] = eq.power != null ? Number(eq.power).toFixed(1) : '-';
          row['임계값(전력)'] = eq.powerThreshold ?? '-';
          row['상태(전력)'] = eq.powerStatus ? getStatusMeta(eq.powerStatus).label : '-';
        }
        return row;
      });

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const baseCols = [{ wch: 8 }, { wch: 15 }, { wch: 12 }, { wch: 25 }];
      const metricCols = [{ wch: 10 }, { wch: 12 }, { wch: 10 }];
      worksheet['!cols'] = [
        ...baseCols,
        ...(needsTemp ? metricCols : []),
        ...(needsPower ? metricCols : []),
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, '시간범위_누적데이터');

      const metricLabel = needsTemp && needsPower ? '온도전력' : needsTemp ? '온도' : '전력';
      const today = new Date();
      const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
      const timeStr = today.toTimeString().slice(0, 5).replace(':', '');
      const fileName = `설비모니터링_구간추출_${metricLabel}_${dateStr}_${timeStr}.xlsx`;

      XLSX.writeFile(workbook, fileName);
    } catch (err) {
      console.error('엑셀 내보내기 실패:', err);
      showAlert('엑셀 파일 생성 실패');
    }
  };

  const handleFieldChange = (equipId, field, value) => {
    setEditedFields(prev => ({
      ...prev,
      [equipId]: {
        ...prev[equipId],
        [field]: field === 'threshold' ? (value === '' ? '' : Number(value)) : value,
      },
    }));
  };

  // 설비 그리드만 최신 데이터로 다시 불러오기 (전체 새로고침 없이) - 온도/전력 API를 둘 다 불러서 합침.
  // 먼저 온 쪽을 바로 반영하면 아직 안 온 쪽 값이 빈 반쪽 상태(혹은 테이블에 남아있던 예전 값)가
  // 잠깐 보였다가 갱신되는 게 거슬린다는 피드백으로, 둘 다 끝난 뒤 한 번에만 반영하도록 함
  const fetchEquipments = () => {
    const headers = user?.token ? { Authorization: `Bearer ${user.token}` } : {};
    let latestTemp = [];
    let latestElec = [];
    return fetchBothDomains(
      `${API_BASE_URL}/api/live/monitoring/temp`,
      `${API_BASE_URL}/api/live/monitoring/elec`,
      headers,
      (tempData, elecData) => { latestTemp = tempData; latestElec = elecData; }
    ).then(() => {
      const data = mergeEquipmentLists(latestTemp, latestElec);
      equipmentsRef.current = data;
      setEquipments(data);
      setHasLoadedEquipmentsOnce(true);
    });
  };

  // 알람 조회 (온도/전력 알람을 각각 조회해서 시간순으로 합침, 먼저 온 쪽부터 반영)
  const fetchAlerts = () => {
    if (!user?.token) return Promise.resolve();
    const headers = { Authorization: `Bearer ${user.token}` };
    return fetchBothDomains(
      `${API_BASE_URL}/api/live/monitoring/temp/noti-warn`,
      `${API_BASE_URL}/api/live/monitoring/elec/noti-warn`,
      headers,
      (tempData, elecData) => {
        // 알람 패널에는 위험 상태만 표시 (경고는 제외)
        const tempAlerts = tempData.filter(item => item.status === '위험').map(item => ({ ...item, metric: 'temperature', value: item.temperature }));
        const elecAlerts = elecData.filter(item => item.status === '위험').map(item => ({ ...item, metric: 'power', value: item.power }));
        const mapped = [...tempAlerts, ...elecAlerts]
          .sort((a, b) => new Date(a.recordedAt) - new Date(b.recordedAt)) // 오래된 것이 위 / 최신이 아래로 오도록 정렬
          .map(item => {
            const eq = equipmentsRef.current.find(e => e.equipId === item.equipId);
            return {
              id: `${item.metric}-${item.equipId}-${item.recordedAt}`,
              equipId: item.equipId,
              equipName: eq?.equipName || item.equipId,
              time: item.recordedAt ? formatClockTime(new Date(item.recordedAt)) : '-',
              recordedAtMs: item.recordedAt ? new Date(item.recordedAt).getTime() : null,
              value: item.value,
              threshold: item.threshold,
              location: eq?.location || '-',
              metric: item.metric,
            };
          })
          // 사용자가 개별 삭제(x)한 알람은 재조회 시 다시 나타나지 않도록 제외
          .filter(a => !dismissedAlarmIdsRef.current.has(a.id));
        notifyDangerAlarms(mapped);
        setAlarms(mapped.slice(-MAX_ALARMS));
      }
    );
  };

  // 로그 조회 (온도/전력 로그를 각각 조회해서 시간순으로 합침, 먼저 온 쪽부터 반영)
  const fetchLogs = () => {
    if (!user?.token) return Promise.resolve();
    const headers = { Authorization: `Bearer ${user.token}` };
    return fetchBothDomains(
      `${API_BASE_URL}/api/live/monitoring/temp/logs`,
      `${API_BASE_URL}/api/live/monitoring/elec/logs`,
      headers,
      (tempData, elecData) => {
        // 로그 응답에 id가 따로 없어서(equipId/threshold/type/value/message/createdAt만 옴),
        // equipId+createdAt+도메인 조합으로 직접 고유 키를 만듦 (알림/alarm 쪽과 동일한 방식)
        const mapped = [
          ...tempData.map(item => ({ ...item, __domain: 'temp' })),
          ...elecData.map(item => ({ ...item, __domain: 'elec' })),
        ]
          .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)) // 오래된 것이 위 / 최신이 아래로 오도록 정렬
          .map(item => ({
            id: `log-${item.__domain}-${item.equipId}-${item.createdAt}`,
            time: item.createdAt ? formatClockTime(new Date(item.createdAt)) : '-',
            type: item.type,
            equipName: item.equipName,
            message: item.message,
            value: item.value,
            threshold: item.threshold,
            metric: item.__domain === 'temp' ? 'temperature' : 'power',
          }));
        setLogs(mapped.slice(-MAX_LOGS));
      }
    );
  };

  // 임계값 설정 탭에서 그리드 맨 위에 인라인으로 추가되는 "신규 설비 입력 행"
  const [newRows, setNewRows] = useState([]);

  // 장비추가 시퀀스 자동 생성
  const getNextEquipId = () => {
    const allIds = [
      ...equipments.map(eq => eq.equipId),
      ...newRows.map(row => row.equipId),
    ].filter(Boolean);

    let prefix = 'EQ-'; //EQ-001
    let pad = 3;
    let maxNum = 0;

    allIds.forEach(id => {
      const match = String(id).match(/^(.*?)(\d+)$/);
      if (!match) return;
      const num = parseInt(match[2], 10);
      if (num > maxNum) {
        maxNum = num;
        prefix = match[1];
        pad = match[2].length;
      }
    });

    return `${prefix}${String(maxNum + 1).padStart(pad, '0')}`;
  };

  const handleAddNewRow = () => {
    setNewRows(prev => [
      ...prev,
      {
        tempId: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        equipId: getNextEquipId(),
        equipName: '',
        location: '',
        temperature: '',
        power: '',
        threshold: '',
      },
    ]);
    gridScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNewRowChange = (tempId, field, value) => {
    setNewRows(prev => prev.map(row => (row.tempId === tempId ? { ...row, [field]: value } : row)));
  };

  const handleRemoveNewRow = (tempId) => {
    setNewRows(prev => prev.filter(row => row.tempId !== tempId));
  };

  const handleSaveThresholds = async () => {
    const isTemp = metricTab === 'temperature';
    const valueField = isTemp ? 'temperature' : 'power';
    const valueLabel = isTemp ? '온도' : '전력';

    for (const row of newRows) {
      if (!row.equipId.trim() || !row.equipName.trim() || !row.location.trim() ||
          row[valueField] === '' || row.threshold === '') {
        showAlert(`신규 설비는 ID / 설비명 / 위치 / ${valueLabel} / 임계값을 모두 입력해야 합니다.`);
        return;
      }
    }

    // 온도/전력이 완전히 분리된 API라서, 현재 탭의 도메인에 실제로 데이터가 있는 설비만
    // payload에 넣음 (없는데 보내면 백엔드가 "신규 설비"로 오인해서 필수값 누락 에러를 던짐)
    const existingPayload = Object.entries(editedFields)
      .filter(([equipId]) => {
        const eq = equipments.find(e => e.equipId === equipId);
        return eq && (isTemp
          ? (eq.temperature != null || eq.threshold != null || eq.status != null)
          : (eq.power != null || eq.powerThreshold != null || eq.powerStatus != null));
      })
      .map(([equipId, fields]) => ({
        equipId,
        equipName: fields.equipName,
        location: fields.location,
        threshold: fields.threshold === '' ? null : Number(fields.threshold),
      }));

    const newRowsPayload = newRows.map(row => ({
      equipId: row.equipId.trim(),
      equipName: row.equipName.trim(),
      location: row.location.trim(),
      [valueField]: Number(row[valueField]),
      threshold: Number(row.threshold),
    }));

    const payload = [...existingPayload, ...newRowsPayload];
    const updateUrl = `${API_BASE_URL}/api/live/monitoring/${isTemp ? 'temp' : 'elec'}/update`;

    try {
      const headers = user?.token ? { Authorization: `Bearer ${user.token}` } : {};
      await axios.put(updateUrl, payload, { headers });

      setNewRows([]);
      await fetchEquipments();

      showAlert('저장되었습니다.');
      setTabMode('stream');
    } catch (err) {
      console.error('DB 저장 실패:', err);
      const serverMessage = typeof err.response?.data === 'string'
        ? err.response.data
        : err.response?.data?.message;
      showAlert(serverMessage || 'DB 저장 중 오류 발생');
    }
  };


  const selectedEquipName = equipments.find(e => e.equipId === selectedEquipId)?.equipName;
  const displayedAlarms = selectedEquipName
    ? alarms.filter(alarm => alarm.equipName === selectedEquipName)
    : alarms;

  // 헤더 클릭으로 정렬 컬럼을 고르지 않았으면 ID 오름차순이 기본값 (equipments가 웹소켓
  // 틱마다 갱신되므로, 정렬 기준이 안 바뀌었으면 다시 정렬하지 않도록 메모)
  const sortedEquipments = useMemo(() => {
    const list = [...equipments];
    if (!sortColumn) {
      return list.sort(compareByEquipId);
    }
    const dir = sortDirection === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      let cmp;
      switch (sortColumn) {
        case 'equipName':
          cmp = String(a.equipName ?? '').localeCompare(String(b.equipName ?? ''));
          break;
        case 'location':
          cmp = String(a.location ?? '').localeCompare(String(b.location ?? ''));
          break;
        case 'receivedAt':
          cmp = (a.receivedAt ? new Date(a.receivedAt).getTime() : 0) - (b.receivedAt ? new Date(b.receivedAt).getTime() : 0);
          break;
        case 'temperature':
          cmp = (a.temperature ?? -Infinity) - (b.temperature ?? -Infinity);
          break;
        case 'power':
          cmp = (a.power ?? -Infinity) - (b.power ?? -Infinity);
          break;
        case 'threshold': {
          // 온도/전력 탭에 따라 그 탭의 임계값 기준으로 정렬
          const aThreshold = metricTab === 'temperature' ? a.threshold : a.powerThreshold;
          const bThreshold = metricTab === 'temperature' ? b.threshold : b.powerThreshold;
          cmp = (aThreshold ?? -Infinity) - (bThreshold ?? -Infinity);
          break;
        }
        case 'status': {
          // 온도/전력 탭에 따라 그 탭의 상태 기준으로 정렬
          const aStatus = metricTab === 'temperature' ? a.status : a.powerStatus;
          const bStatus = metricTab === 'temperature' ? b.status : b.powerStatus;
          cmp = STATUS_SORT_ORDER[getStatusMeta(aStatus).label] - STATUS_SORT_ORDER[getStatusMeta(bStatus).label];
          break;
        }
        default:
          cmp = compareByEquipId(a, b);
      }
      return cmp * dir;
    });
    return list;
  }, [equipments, sortColumn, sortDirection, metricTab]);

  // ID / 설비명 검색 + 상태(정상/경고/위험) 필터링
  const filteredEquipments = useMemo(() => {
    const q = equipSearch.trim().toLowerCase();
    let list = sortedEquipments;
    if (q) {
      list = list.filter(eq =>
        String(eq.equipId).toLowerCase().includes(q) || String(eq.equipName ?? '').toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'all') {
      const targetLabel = STATUS_FILTER_LABELS[statusFilter];
      list = list.filter(eq => getStatusMeta(metricTab === 'temperature' ? eq.status : eq.powerStatus).label === targetLabel);
    }
    return list;
  }, [sortedEquipments, equipSearch, statusFilter, metricTab]);

  // 현재 설비 상태 기준 정상/경고/위험 개수 (알람 패널 요약 뱃지용, 온도/전력 탭에 따라 다르게 집계)
  const statusCounts = equipments.reduce((acc, eq) => {
    const label = getStatusMeta(metricTab === 'temperature' ? eq.status : eq.powerStatus).label;
    if (label === '위험') acc.danger += 1;
    else if (label === '경고') acc.warning += 1;
    else acc.normal += 1;
    return acc;
  }, { normal: 0, warning: 0, danger: 0 });

  // 설비별 "오늘 00:00부터 지금까지" 상태 흐름을 온도/전력 각각 색 구간으로 계산. 날짜 범위
  // 선택기와 무관하게 항상 오늘 자정을 왼쪽 끝, "지금"을 오른쪽 끝으로 해서 주기적으로 다시 계산함
  const [equipTimelines, setEquipTimelines] = useState(() => loadCachedTimelines() || {});
  // 첫 조회가 끝나기 전까지는 "확실히 비어있음"과 구분해서 로딩 표시를 해줌
  // (캐시된 값이 있으면 새로고침 직후에도 곧바로 채워진 상태로 시작함)
  const [hasLoadedTimelinesOnce, setHasLoadedTimelinesOnce] = useState(() => loadCachedTimelines() !== null);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const endMs = Date.now();
      const startMs = getTodayStartMs();
      try {
        // IndexedDB가 딱 "오늘 00:00 이후"만 보관하므로 시작점이 항상 일치해서, 로컬 조회만으로 충분함
        const records = await getByDateRangeIndexedFromDB(startMs, endMs);
        if (cancelled) return;

        // 온도 도메인 기록엔 temperature가, 전력 도메인 기록엔 power가 들어있으므로
        // (한 레코드가 둘 다 갖지는 않음) 값이 있는 쪽 맵에만 넣어서 도메인별로 분리함
        const byEquipTemp = new Map();
        const byEquipPower = new Map();
        records.forEach(r => {
          if (!r.receivedAt) return;
          const t = new Date(r.receivedAt).getTime();
          const point = { time: t, color: getStatusMeta(r.status).color };
          if (r.temperature != null) {
            if (!byEquipTemp.has(r.equipId)) byEquipTemp.set(r.equipId, []);
            byEquipTemp.get(r.equipId).push(point);
          }
          if (r.power != null) {
            if (!byEquipPower.has(r.equipId)) byEquipPower.set(r.equipId, []);
            byEquipPower.get(r.equipId).push(point);
          }
        });

        const tempSegments = buildTimelineSegments(byEquipTemp, startMs, endMs);
        const powerSegments = buildTimelineSegments(byEquipPower, startMs, endMs);
        const equipIds = new Set([...Object.keys(tempSegments), ...Object.keys(powerSegments)]);
        const result = {};
        equipIds.forEach(equipId => {
          result[equipId] = { temperature: tempSegments[equipId] || [], power: powerSegments[equipId] || [] };
        });

        setEquipTimelines(result);
        setHasLoadedTimelinesOnce(true);
        saveCachedTimelines(result);
      } catch (e) {
        console.error('설비별 전체 흐름 조회 실패:', e);
      }
    };
    load();
    const intervalId = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  // 정렬 가능한 표 헤더 셀 (클릭 시 그 컬럼 기준으로 정렬, 다시 누르면 오름/내림차순 전환)
  const renderSortableHeader = (column, label, widthClass, extraClass = '') => {
    const isActive = sortColumn === column;
    return (
      <th
        onClick={() => handleSortClick(column)}
        className={`${widthClass} px-3 border-b font-semibold text-center align-middle uppercase cursor-pointer select-none transition-colors ${extraClass} ${
          isDarkMode ? 'border-[#2A335A] hover:text-[#EDF1FC]' : 'border-gray-300 hover:text-gray-800'
        } ${isActive ? (isDarkMode ? 'text-[#22D3EE]' : 'text-green-700') : ''}`}
      >
        <span className="inline-flex items-center justify-center gap-0.5">
          {label}
          {isActive && <span className="text-[9px]">{sortDirection === 'asc' ? '▲' : '▼'}</span>}
        </span>
      </th>
    );
  };

  return (
    <div className={`w-full min-w-[320px] flex flex-col transition-colors h-[calc(100vh/1.1)] max-h-[calc(1080px/1.1)] overflow-hidden ${
      isDarkMode ? 'bg-[#0A0E1A]' : 'bg-gray-50'
    }`}>
      <Header
        user={user}
        route={route}
        setRoute={setRoute}
        openMyPage={openMyPage}
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
        isAlarmOn={isAlarmOn}
        setIsAlarmOn={setIsAlarmOn}
      />

      <div className="flex-1 p-3 sm:p-4 md:p-6 flex flex-col gap-4 max-w-[1920px] mx-auto w-full overflow-hidden h-full">
        {/* 그리드 영역 */}
        <div className="flex-1 flex flex-col lg:flex-row gap-4 min-h-0 items-stretch overflow-hidden">
          <div className={`flex-1 min-w-0 rounded-xl p-3.5 sm:p-5 flex flex-col border transition-colors min-h-0 overflow-hidden ${
            isDarkMode ? 'bg-[#12172A] border-[#1E253D]' : 'bg-white border-gray-200 shadow-sm'
          }`}>
            <div className={`flex flex-wrap items-center justify-between gap-2 mb-3 sm:mb-4 pb-3 border-b shrink-0 min-h-[36px] ${
              isDarkMode ? 'border-[#1E253D]' : 'border-gray-200'
            }`}>
              <div className="flex items-center gap-2.5 h-8">
                {/* 온도 / 전력 탭 전환 (값/임계값/상태 컬럼이 통째로 바뀜) */}
                <div className={`relative flex items-center p-0.5 rounded-full border shrink-0 transition-colors ${
                  isDarkMode ? 'bg-[#0D1224] border-[#232B45]' : 'bg-gray-100 border-gray-200'
                }`}>
                  <button
                    type="button"
                    onClick={() => setMetricTab('temperature')}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide transition-colors outline-none ${
                      metricTab === 'temperature'
                        ? (isDarkMode ? 'bg-[#1E2A4A] text-[#22D3EE] border border-[#22D3EE]/40' : 'bg-white text-green-700 border border-gray-300 shadow-sm')
                        : (isDarkMode ? 'text-[#7D87A8] hover:text-[#B9C2DE] border border-transparent' : 'text-gray-500 hover:text-gray-800 border border-transparent')
                    }`}
                  >
                    온도
                  </button>
                  <button
                    type="button"
                    onClick={() => setMetricTab('power')}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide transition-colors outline-none ${
                      metricTab === 'power'
                        ? (isDarkMode ? 'bg-[#1E2A4A] text-[#22D3EE] border border-[#22D3EE]/40' : 'bg-white text-green-700 border border-gray-300 shadow-sm')
                        : (isDarkMode ? 'text-[#7D87A8] hover:text-[#B9C2DE] border border-transparent' : 'text-gray-500 hover:text-gray-800 border border-transparent')
                    }`}
                  >
                    전력
                  </button>
                </div>

                {/* ID / 설비명 검색 */}
                <div className="relative">
                  <svg className={`absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none ${isDarkMode ? 'text-[#5C6584]' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
                  </svg>
                  <input
                    type="text"
                    value={equipSearch}
                    onChange={(e) => setEquipSearch(e.target.value)}
                    placeholder="ID / 설비명 검색"
                    className={`w-[160px] sm:w-[200px] h-8 pl-8 pr-7 rounded-lg text-xs outline-none border transition-colors ${
                      isDarkMode
                        ? 'bg-[#0D1224] border-[#232B45] text-[#EDF1FC] placeholder:text-[#5C6584] focus:border-[#22D3EE]/60'
                        : 'bg-gray-50 border-gray-200 text-gray-800 placeholder:text-gray-400 focus:border-green-400'
                    }`}
                  />
                  {equipSearch && (
                    <button
                      type="button"
                      onClick={() => setEquipSearch('')}
                      className={`absolute right-2 top-1/2 -translate-y-1/2 text-sm leading-none ${isDarkMode ? 'text-[#5C6584] hover:text-[#EDF1FC]' : 'text-gray-400 hover:text-gray-700'}`}
                    >
                      &times;
                    </button>
                  )}
                </div>

                {/* 상태(정상/경고/위험) 필터 - 탭/검색과 같은 "필터링" 성격이라 한 그룹으로 묶음 */}
                <div className="flex items-center gap-1">
                  {STATUS_FILTER_OPTIONS.map(opt => {
                    const isActive = statusFilter === opt.key;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setStatusFilter(opt.key)}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors border cursor-pointer ${
                          isActive
                            ? STATUS_FILTER_ACTIVE_CLASS[opt.key][isDarkMode ? 'dark' : 'light']
                            : (isDarkMode ? 'border-transparent text-[#7D87A8] hover:text-[#EDF1FC] hover:border-[#232B45]' : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-200')
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>

                {tabMode === 'threshold' && (
                  <>
                    <button
                      onClick={handleAddNewRow}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors h-7 flex items-center justify-center gap-1 border ${
                        isDarkMode ? 'border-[#2A335A] hover:bg-[#1E2745] text-[#EDF1FC]' : 'border-gray-300 hover:bg-gray-100 text-gray-700'
                      }`}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path>
                      </svg>
                      장비추가
                    </button>
                    <button
                      onClick={() => askConfirm('저장하시겠습니까?', handleSaveThresholds)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors h-7 flex items-center justify-center ${
                        isDarkMode ? 'bg-[#22D3EE] hover:bg-[#3FDCF0] text-[#0A0E1A]' : 'bg-green-600 hover:bg-green-700 text-white'
                      }`}
                    >
                      저장
                    </button>
                  </>
                )}
              </div>

              <div className="flex items-center gap-3 h-8">
                <span className={`flex items-center gap-1.5 text-[11px] font-mono ${
                  isDarkMode ? 'text-[#7D87A8]' : 'text-gray-500'
                }`}>
                  {isConnected ? (
                    <>
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#34D399] opacity-60"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#34D399]"></span>
                      </span>
                      <span className="text-[#34D399] font-bold">LIVE ({equipments.length}대)</span>
                    </>
                  ) : loadError ? (
                    <span className="text-[#FB5D75]">{loadError}</span>
                  ) : (
                    <span className="text-amber-500">웹소켓 연결 중...</span>
                  )}
                </span>

                {/* 정보 표시(상태 필터 · LIVE)와 액션 버튼(내보내기 · 설정)을 구분하는 얇은 구분선 */}
                <div className={`w-px h-5 ${isDarkMode ? 'bg-[#232B45]' : 'bg-gray-200'}`} />

                {/* 엑셀 내보내기 (기간 선택 팝오버) */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      const willOpen = !isRangeEditorOpen;
                      if (willOpen) {
                        // 팝오버를 열 때마다 "최근 1시간(1시간 전 ~ 현재)"으로 초기화
                        const now = new Date();
                        setStartTime(new Date(now.getTime() - 60 * 60 * 1000));
                        setEndTime(now);
                        setSelectedPreset('FULL_1HR');
                      }
                      setIsRangeEditorOpen(willOpen);
                    }}
                    title="엑셀 내보내기"
                    className={`h-8 flex items-center gap-1.5 px-2.5 rounded-lg border text-[11px] font-bold transition-colors cursor-pointer ${
                      isRangeEditorOpen
                        ? (isDarkMode ? 'bg-[#1E2A4A] border-[#22D3EE]/40 text-[#22D3EE]' : 'bg-green-100 border-green-300 text-green-700')
                        : (isDarkMode ? 'border-[#232B45] text-[#7D87A8] hover:text-[#EDF1FC] hover:border-[#2A335A]' : 'border-gray-200 text-gray-500 hover:text-gray-800 hover:border-gray-300')
                    }`}
                  >
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    엑셀 내보내기
                  </button>

                  {isRangeEditorOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setIsRangeEditorOpen(false)} />
                      <div className={`absolute top-full right-0 mt-2 z-50 w-[260px] p-3 rounded-xl border shadow-2xl space-y-2.5 ${
                        isDarkMode ? 'bg-[#12172A] border-[#232B45]' : 'bg-white border-gray-200'
                      }`}>
                        <DateTimePicker
                          label="시작"
                          value={startTime}
                          max={endTime}
                          onChange={handleStartTimeChange}
                          isDarkMode={isDarkMode}
                        />
                        <DateTimePicker
                          label="종료"
                          value={endTime}
                          min={startTime}
                          max={new Date()}
                          onChange={handleEndTimeChange}
                          isDarkMode={isDarkMode}
                        />

                        <Dropdown
                          value={selectedPreset}
                          onChange={handlePresetRange}
                          options={PRESET_OPTIONS}
                          isDarkMode={isDarkMode}
                          widthClass="w-full"
                          placeholder="빠른 선택"
                        />

                        <div className="flex items-center gap-4 px-0.5">
                          <Checkbox
                            checked={exportIncludeTemp}
                            onChange={() => setExportIncludeTemp(prev => (prev && !exportIncludePower ? prev : !prev))}
                            isDarkMode={isDarkMode}
                            label="온도"
                          />
                          <Checkbox
                            checked={exportIncludePower}
                            onChange={() => setExportIncludePower(prev => (prev && !exportIncludeTemp ? prev : !prev))}
                            isDarkMode={isDarkMode}
                            label="전력"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={async () => {
                            await handleExport();
                            setIsRangeEditorOpen(false);
                          }}
                          className={`w-full py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5 ${
                            isDarkMode ? 'bg-[#22D3EE] hover:bg-[#3FDCF0] text-[#0A0E1A]' : 'bg-green-700 hover:bg-green-800 text-white'
                          }`}
                        >
                          <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="2" strokeLinejoin="round" />
                            <line x1="3" y1="9.5" x2="21" y2="9.5" strokeWidth="2" strokeLinecap="round" />
                            <line x1="3" y1="15" x2="21" y2="15" strokeWidth="2" strokeLinecap="round" />
                            <line x1="9.5" y1="3" x2="9.5" y2="21" strokeWidth="2" strokeLinecap="round" />
                          </svg>
                          내보내기
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      if (tabMode === 'threshold') {
                        setNewRows([]); // 저장하지 않고 나가면 인라인으로 추가하던 신규 행은 버림
                        setTabMode('stream');
                      } else {
                        setTabMode('threshold');
                      }
                    }}
                    title={tabMode === 'threshold' ? '설정 닫기' : '설비 설정'}
                    className={`p-1.5 rounded-lg border transition-colors flex items-center justify-center ${
                      tabMode === 'threshold'
                        ? (isDarkMode ? 'bg-[#1E2A4A] border-[#22D3EE]/40 text-[#22D3EE]' : 'bg-green-100 border-green-300 text-green-700')
                        : (isDarkMode ? 'border-[#232B45] text-[#7D87A8] hover:text-[#EDF1FC] hover:border-[#2A335A]' : 'border-gray-200 text-gray-500 hover:text-gray-800 hover:border-gray-300')
                    }`}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* 그리드 표 */}
            <div ref={gridScrollRef} className="flex-1 overflow-x-auto overflow-y-auto min-h-0 custom-scrollbar">
              <table className="w-full text-center border-collapse table-fixed min-w-[700px] sm:min-w-[800px]">
                <thead className={`sticky top-0 text-xs z-10 transition-colors ${
                  isDarkMode ? 'bg-[#0D1224] text-[#7D87A8]' : 'bg-gray-50 text-gray-500'
                }`}>
                  <tr className="h-[40px]">
                    {renderSortableHeader('equipId', 'ID', 'w-[9%]')}
                    {renderSortableHeader('equipName', '설비명', 'w-[18%]')}
                    {renderSortableHeader('location', '위치', 'w-[9%]')}
                    {renderSortableHeader('receivedAt', '수신 시간', 'w-[16%]')}
                    {renderSortableHeader(metricTab, metricTab === 'temperature' ? '온도' : '전력', 'w-[11%]')}
                    {renderSortableHeader('threshold', metricTab === 'temperature' ? '임계값(온도)' : '임계값(전력)', 'w-[11%]')}
                    {renderSortableHeader('status', '상태', 'w-[14%]')}
                    <th className={`w-[18%] grid-th`}>전체 흐름</th>
                  </tr>
                </thead>
                <tbody className={`divide-y text-[13px] sm:text-sm ${
                  isDarkMode ? 'divide-[#2A335A] text-[#B9C2DE]' : 'divide-gray-300 text-gray-600'
                }`}>
                  {/* 신규 설비 인라인 입력 행 (장비추가 클릭 시 맨 위에 생성, 저장 시 함께 등록) */}
                  {newRows.map((row) => {
                    const inputClass = `w-full h-[30px] rounded px-1.5 text-xs text-center border outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                      isDarkMode ? 'bg-[#0D1224] border-[#2A335A] text-[#EDF1FC] focus:border-[#22D3EE]' : 'bg-white border-gray-300 text-gray-800 focus:border-green-600'
                    }`;

                    return (
                      <tr
                        key={row.tempId}
                        className={`h-[52px] max-h-[52px] border-l-2 ${
                          isDarkMode ? 'bg-[#151B30] border-l-[#22D3EE]' : 'bg-green-50/70 border-l-green-600'
                        }`}
                      >
                        <td className={`px-3 py-0 h-[52px] align-middle`}>
                          <input
                            type="text"
                            value={row.equipId}
                            readOnly
                            title="ID는 자동으로 부여됩니다"
                            className={`${inputClass} cursor-not-allowed opacity-70`}
                          />
                        </td>
                        <td className={`px-3 py-0 h-[52px] align-middle`}>
                          <input type="text" value={row.equipName} onChange={(e) => handleNewRowChange(row.tempId, 'equipName', e.target.value)} placeholder="설비명" className={inputClass} />
                        </td>
                        <td className={`px-3 py-0 h-[52px] align-middle`}>
                          <input type="text" value={row.location} onChange={(e) => handleNewRowChange(row.tempId, 'location', e.target.value)} placeholder="위치" className={inputClass} />
                        </td>
                        <td className={`px-3 py-0 h-[52px] font-mono text-xs text-center truncate align-middle ${isDarkMode ? 'text-[#7D87A8]' : 'text-gray-400'}`}>
                          -
                        </td>
                        <td className={`px-3 py-0 h-[52px] align-middle`}>
                          {metricTab === 'temperature' ? (
                            <input type="number" value={row.temperature} onChange={(e) => handleNewRowChange(row.tempId, 'temperature', e.target.value)} placeholder="온도" className={inputClass} />
                          ) : (
                            <input type="number" value={row.power} onChange={(e) => handleNewRowChange(row.tempId, 'power', e.target.value)} placeholder="전력" className={inputClass} />
                          )}
                        </td>
                        <td className={`px-3 py-0 h-[52px] align-middle`}>
                          <input type="number" value={row.threshold} onChange={(e) => handleNewRowChange(row.tempId, 'threshold', e.target.value)} placeholder="임계값" className={inputClass} />
                        </td>
                        <td className={`px-3 py-0 h-[52px] font-mono text-xs text-center truncate align-middle ${isDarkMode ? 'text-[#7D87A8]' : 'text-gray-400'}`}>
                          -
                        </td>
                        <td className="px-3 py-0 h-[52px] text-center align-middle">
                          <button
                            onClick={() => handleRemoveNewRow(row.tempId)}
                            title="취소"
                            className={`p-1.5 rounded-lg border transition-colors ${
                              isDarkMode ? 'border-[#FB5D75]/30 text-[#FB5D75] hover:bg-[#FB5D75]/10' : 'border-red-200 text-red-500 hover:bg-red-50'
                            }`}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    );
                  })}

                  {equipments.length === 0 && newRows.length === 0 && (
                    <tr>
                      <td colSpan={8} className={`px-3.5 py-10 text-center ${isDarkMode ? 'text-[#7D87A8]' : 'text-gray-400'}`}>
                        {!hasLoadedEquipmentsOnce
                          ? '데이터를 불러오는 중...'
                          : isConnected ? '등록된 설비가 없습니다.' : '웹소켓 연결을 확인해 주세요.'}
                      </td>
                    </tr>
                  )}
                  {equipments.length > 0 && filteredEquipments.length === 0 && (
                    <tr>
                      <td colSpan={8} className={`px-3.5 py-10 text-center ${isDarkMode ? 'text-[#7D87A8]' : 'text-gray-400'}`}>
                        {equipSearch
                          ? `'${equipSearch}'에 대한 검색 결과가 없습니다.`
                          : '해당하는 상태의 설비가 없습니다.'}
                      </td>
                    </tr>
                  )}
                  {filteredEquipments.map((eq) => {
                    const isTemp = metricTab === 'temperature';
                    const value = isTemp ? eq.temperature : eq.power;
                    const threshold = isTemp ? eq.threshold : eq.powerThreshold;
                    const status = isTemp ? eq.status : eq.powerStatus;
                    const statusMeta = getStatusMeta(status);
                    const statusStyle = STATUS_STYLES[statusMeta.color][isDarkMode ? 'dark' : 'light'];
                    const isSelected = selectedEquipId === eq.equipId;
                    const isFlashed = flashedIds.has(eq.equipId);

                    const isClickHighlighted = clickHighlightId === eq.equipId;
                    const isDanger = statusMeta.color === 'red';
                    const isWarning = statusMeta.color === 'amber';

                    return (
                      <tr
                        key={eq.equipId}
                        id={`equip-row-${eq.equipId}`}
                        onClick={() => {
                          setSelectedEquipId(isSelected ? null : eq.equipId);
                        }}
                        className={`h-[52px] max-h-[52px] transition-colors duration-300 cursor-pointer border-l-2 ${
                          isClickHighlighted
                            ? (isDarkMode ? 'bg-amber-400/15 border-l-amber-400' : 'bg-amber-100 border-l-amber-500')
                            : isSelected
                              ? (isDarkMode ? 'bg-[#151B30] border-l-[#22D3EE]' : 'bg-green-50/70 border-l-green-600')
                              : isFlashed
                                ? (isDarkMode ? 'bg-[#22D3EE]/10 border-l-transparent' : 'bg-green-50 border-l-transparent')
                                : isDanger
                                  ? (isDarkMode ? 'bg-[#FB5D75]/15 hover:bg-[#FB5D75]/20 border-l-[#FB5D75]' : 'bg-red-50 hover:bg-red-100 border-l-red-500')
                                  : isWarning
                                    ? (isDarkMode ? 'bg-[#FBBF24]/10 hover:bg-[#FBBF24]/15 border-l-amber-400' : 'bg-amber-50 hover:bg-amber-100 border-l-amber-500')
                                    : (isDarkMode ? 'hover:bg-[#0F1526] border-l-transparent' : 'hover:bg-gray-50 border-l-transparent')
                        }`}
                      >
                        <td className={`px-3 py-0 h-[52px] font-mono text-center truncate align-middle ${isDarkMode ? 'text-[#7D87A8]' : 'text-gray-400'}`}>
                          #{String(eq.equipId).padStart(3, '0')}
                        </td>
                        <td className={`px-3 py-0 h-[52px] text-center align-middle`}>
                          <div className="flex items-center justify-center h-full">
                            {tabMode === 'threshold' ? (
                              <input
                                type="text"
                                value={editedFields[eq.equipId]?.equipName ?? eq.equipName ?? ''}
                                onChange={(e) => handleFieldChange(eq.equipId, 'equipName', e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                className={`w-full h-[30px] rounded px-1.5 focus:outline-none border text-xs text-center leading-none transition-all ${
                                  isDarkMode ? 'bg-[#0D1224] border-[#2A335A] text-[#EDF1FC] focus:border-[#22D3EE]' : 'bg-white border-gray-300 text-gray-800 focus:border-green-600'
                                }`}
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setHistoryEquipId(eq.equipId);
                                  setHistoryMetric(null);
                                }}
                                title="클릭하면 상세 이력을 볼 수 있습니다"
                                className={`font-bold truncate underline decoration-dotted underline-offset-2 cursor-pointer transition-colors ${
                                  isSelected
                                    ? (isDarkMode ? 'text-[#22D3EE] decoration-[#22D3EE]/50' : 'text-green-700 decoration-green-700/40')
                                    : (isDarkMode ? 'text-[#EDF1FC] decoration-[#7D87A8]/50 hover:text-[#22D3EE]' : 'text-gray-800 decoration-gray-400 hover:text-green-700')
                                }`}
                              >
                                {eq.equipName}
                              </button>
                            )}
                          </div>
                        </td>
                        <td className={`px-3 py-0 h-[52px] text-center align-middle`}>
                          <div className="flex items-center justify-center h-full">
                            {tabMode === 'threshold' ? (
                              <input
                                type="text"
                                value={editedFields[eq.equipId]?.location ?? eq.location ?? ''}
                                onChange={(e) => handleFieldChange(eq.equipId, 'location', e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                className={`w-full h-[30px] rounded px-1.5 focus:outline-none border text-xs text-center leading-none transition-all ${
                                  isDarkMode ? 'bg-[#0D1224] border-[#2A335A] text-[#EDF1FC] focus:border-[#22D3EE]' : 'bg-white border-gray-300 text-gray-800 focus:border-green-600'
                                }`}
                              />
                            ) : (
                              <span className={`text-xs truncate ${isDarkMode ? 'text-[#9FACC9]' : 'text-gray-600'}`}>
                                {eq.location ?? '-'}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className={`px-3 py-0 h-[52px] font-mono text-[13px] text-center truncate align-middle ${isDarkMode ? 'text-[#7D87A8]' : 'text-gray-500'}`}>
                          {eq.receivedAt ? formatClockTime(new Date(eq.receivedAt)) : '-'}
                        </td>
                        <td className={`px-3 py-0 h-[52px] text-center align-middle`}>
                          <span className={`text-sm font-mono font-bold tabular-nums ${
                            status == null ? (isDarkMode ? 'text-[#5C6584]' : 'text-gray-400') : statusMeta.color === 'green' ? (isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-800') : statusStyle.text
                          }`}>
                            {value != null ? (
                              <>{Number(value).toFixed(1)}{isTemp && <span className="text-xs">℃</span>}</>
                            ) : '–'}
                          </span>
                        </td>
                        <td className={`px-3 py-0 h-[52px] align-middle`}>
                          <div className="flex items-center justify-center h-full">
                            {tabMode === 'threshold' ? (
                              <input
                                type="number"
                                value={editedFields[eq.equipId]?.threshold !== undefined ? editedFields[eq.equipId].threshold : (threshold ?? '')}
                                onChange={(e) => handleFieldChange(eq.equipId, 'threshold', e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                className={`w-[70px] h-[30px] rounded px-1.5 focus:outline-none text-center border text-xs leading-none transition-all shrink-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                                  isDarkMode ? 'bg-[#0D1224] border-[#2A335A] text-[#EDF1FC] focus:border-[#22D3EE]' : 'bg-white border-gray-300 text-gray-800 focus:border-green-600'
                                }`}
                              />
                            ) : (
                              <span className={`text-xs ${isDarkMode ? 'text-[#7D87A8]' : 'text-gray-500'}`}>
                                {threshold ?? '–'}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-0 h-[52px] text-center align-middle">
                          {status == null ? (
                            <span className={`text-xs ${isDarkMode ? 'text-[#5C6584]' : 'text-gray-400'}`}>–</span>
                          ) : (
                            <span className={`inline-flex items-center gap-1 text-xs font-bold whitespace-nowrap ${statusStyle.text}`}>
                              <span className={`status-dot ${statusStyle.dot}`} />
                              {statusMeta.label}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-0 h-[52px] align-middle">
                          <EquipTimelineBar segments={equipTimelines[eq.equipId]?.[metricTab]} isDarkMode={isDarkMode} loading={!hasLoadedTimelinesOnce} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 오른쪽: 그래프(모두) + 알람(관리자 전용) */}
          <div className="w-full lg:w-[440px] xl:w-[520px] shrink-0 flex flex-col gap-4 h-[520px] lg:h-auto min-h-0">
              <div className="flex-1 min-h-0">
                <EquipmentTrendGrid
                  equipments={equipments}
                  isDarkMode={isDarkMode}
                  metric={metricTab}
                  onSelectEquip={(id, metric) => {
                    setHistoryEquipId(id);
                    setHistoryMetric(metric);
                  }}
                  statusCounts={!isAdmin ? statusCounts : undefined}
                />
              </div>
              {isAdmin && (
                <div className="flex-1 min-h-0">
                  <AlarmSidebar
                    alarms={displayedAlarms}
                    onClear={handleClearAlarms}
                    onDismiss={handleDismissAlarm}
                    onAlarmClick={handleAlarmClick}
                    openLogs={openLogs}
                    selectedEquipName={selectedEquipName}
                    onClearFilter={() => setSelectedEquipId(null)}
                    statusCounts={statusCounts}
                    isDarkMode={isDarkMode}
                    metricTab={metricTab}
                  />
                </div>
              )}
          </div>
        </div>
      </div>

      <CustomAlert message={alertMessage} onClose={() => setAlertMessage('')} isDarkMode={isDarkMode} />
      <CustomConfirm message={confirmMessage} onConfirm={handleConfirmYes} onCancel={handleConfirmNo} isDarkMode={isDarkMode} />

      {historyEquipId && (() => {
        const historyEquip = equipments.find(eq => eq.equipId === historyEquipId);
        return (
          <EquipmentHistoryModal
            equipId={historyEquipId}
            equipName={historyEquip?.equipName}
            threshold={historyEquip?.threshold}
            powerThreshold={historyEquip?.powerThreshold}
            focusMetric={historyMetric}
            onClose={() => { setHistoryEquipId(null); setHistoryMetric(null); }}
            isDarkMode={isDarkMode}
          />
        );
      })()}
    </div>
  );
};

export default RealtimeScreen;