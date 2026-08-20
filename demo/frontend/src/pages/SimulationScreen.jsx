import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Header from '../components/Header';
import AlarmSidebar from '../components/AlarmSidebar';
import FullLogModal from '../components/FullLogModal';
import CustomAlert from '../components/CustomAlert';
import CustomConfirm from '../components/CustomConfirm';
import SimulationTrendChart from '../components/SimulationTrendChart';
import Dropdown from '../components/Dropdown';
import EquipTimelineBar from '../components/EquipTimelineBar';
import LoadingSpinner from '../components/LoadingSpinner';
import { listScenarios, getScenarioDetail, uploadScenario, updateScenarioRows, deleteScenarioApi, renameScenarioApi } from '../utils/simulationApi';
import { parseSimulationFileInWorker, computeStatus, computeCombinedStatus, isWarningStatus, formatMmSs, formatClockTime } from '../utils/simulationParse';
import { STATUS_STYLES, getStatusMeta } from '../utils/statusStyles';
import { useClickOutside } from '../utils/useClickOutside';
import { compareByEquipId, STATUS_SORT_ORDER } from '../utils/sortHelpers';
import { formatKoreanDateTime } from '../utils/dateFormat';
import { exportToCsv } from '../utils/csvExport';

const SPEED_OPTIONS = [1, 2, 4, 8];
// 알람/로그 패널에 표시할 최대 개수 - 예전엔 재생 중 계속 이어붙이기만(unbounded) 해서, 전환
// 이벤트가 많은(=일주일치 같은) 시나리오는 재생이 진행될수록 이 배열이 계속 커지며 매 틱마다
// 복사/리렌더 비용이 누적돼 뒤로 갈수록 전체가 버벅였음(재생바까지 같이 밀림)
const MAX_SIM_ALARMS = 200;
const MAX_SIM_LOGS = 500;
// "선택한 설비의 지금까지 추이" 그래프에 실제로 그릴 최대 점 개수 - 이보다 많으면 균등 간격으로
// 표본을 뽑아서(마지막 점은 항상 포함) 재생 위치가 뒤로 갈수록 매 틱 처리량이 계속 늘어나지 않게 함
const MAX_SERIES_POINTS = 1000;
// 데이터가 이만큼 이상 비어있으면(기본 1시간) 그 구간은 재생 시간에서 통째로 뺌
const GAP_THRESHOLD_MS = 60 * 60 * 1000;

// 값 수정 셀 (온도/전력/임계값 입력창) - 입력 중 부모 재계산에 값이 씹히지 않도록 로컬 상태로 관리
const EditableCell = ({ initialValue, onChangeValue, className }) => {
  const [value, setValue] = useState(initialValue);
  // prop이 바뀌면(다른 행의 "이후 전체 적용" 수정 등) 화면 값도 동기화
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setValue(initialValue);
  }, [initialValue]);
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => { setValue(e.target.value); onChangeValue(e.target.value); }}
      onClick={(e) => e.stopPropagation()}
      className={className}
    />
  );
};

// 시뮬레이션 모드 화면 (엑셀 업로드 → 재생하며 시나리오 테스트, 유저별로 서버에 저장)
const SimulationScreen = ({ user, route, setRoute, openMyPage, isDarkMode, setIsDarkMode, isAlarmOn, setIsAlarmOn }) => {
  const [scenarios, setScenarios] = useState([]);
  const [isLoadingScenarios, setIsLoadingScenarios] = useState(true); // 시나리오 목록 최초 조회 중
  const [isLoadingDetail, setIsLoadingDetail] = useState(false); // 선택한 시나리오 상세(로우) 조회 중
  const [isUploadingFile, setIsUploadingFile] = useState(false); // 엑셀 파일 파싱/업로드 중
  const [isSavingScenario, setIsSavingScenario] = useState(false); // 시나리오 저장 중
  const [isExportingFile, setIsExportingFile] = useState(false); // CSV 내보내기 중
  const [selectedScenarioId, setSelectedScenarioId] = useState(null);
  const [rows, setRows] = useState([]); // 선택된 시나리오의 정규화된 원본 로우 (시간순 정렬)

  const [playState, setPlayState] = useState('stopped'); // 'stopped' | 'playing' | 'paused'
  const [elapsedMs, setElapsedMs] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [editedValues, setEditedValues] = useState({}); // { equipId: { temperature?, power?, threshold?, powerThreshold? } -> { [timeMs]: { value, forward } } }
  // 셀 수정 시 적용 범위: false=그 시점만(스파이크), true=그 시점 이후 전체
  const [applyForward, setApplyForward] = useState(false);

  // 셀 수정 되돌리기(Undo) - editedValues 스냅샷을 쌓아뒀다가 복원. 같은 셀 연속 타이핑은 한 단계로 묶음
  const [undoStack, setUndoStack] = useState([]);
  const lastEditKeyRef = useRef(null);

  const [simAlarms, setSimAlarms] = useState([]);
  const [simLogs, setSimLogs] = useState([]);
  const [selectedEquipId, setSelectedEquipId] = useState(null);
  // 드롭다운에서 설비를 고르면 그 설비의 전체 시간별 이력을 쭉 나열해서 보여줌 (읽기 전용 보기)
  const [viewEquipId, setViewEquipId] = useState('');
  // 설비를 바꾸면 무거운 이력 표/차트 렌더링이 바로 막히지 않도록, 로딩 표시부터 한 프레임
  // 먼저 그리게 하고 실제 전환은 한 박자 늦게 함 (rows가 많을 때 드롭다운 클릭 시 렉의 체감을 줄임)
  const [displayViewEquipId, setDisplayViewEquipId] = useState('');
  const [isViewEquipPending, setIsViewEquipPending] = useState(false);
  useEffect(() => {
    if (viewEquipId === displayViewEquipId) return undefined;
    setIsViewEquipPending(true);
    const rafId = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setDisplayViewEquipId(viewEquipId);
        setIsViewEquipPending(false);
      });
    });
    return () => cancelAnimationFrame(rafId);
  }, [viewEquipId, displayViewEquipId]);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  // 전체보기 표 헤더 클릭 정렬 (null이면 ID 오름차순 기본 정렬)
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

  // 시나리오 이름 수정 (PATCH /api/simulation/scenarios/rename)
  const [renamingScenarioId, setRenamingScenarioId] = useState(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [titleInputWidth, setTitleInputWidth] = useState(null);
  const titleRenameRef = useRef(null);
  useClickOutside(titleRenameRef, () => {
    setRenamingScenarioId(null);
    setRenameDraft('');
  }, renamingScenarioId !== null);
  const startRename = (e, s) => {
    e.stopPropagation();
    setTitleInputWidth(e.currentTarget.getBoundingClientRect().width);
    setRenamingScenarioId(s.id);
    setRenameDraft(s.fileName);
  };
  const cancelRename = () => {
    setRenamingScenarioId(null);
    setRenameDraft('');
  };
  const confirmRename = async (id) => {
    const trimmed = renameDraft.trim();
    if (!trimmed) {
      cancelRename();
      return;
    }
    const original = scenarios.find(s => s.id === id)?.fileName;
    if (trimmed === original) {
      cancelRename();
      return;
    }
    try {
      await renameScenarioApi(id, trimmed, user?.token);
    } catch (err) {
      console.error('시나리오 이름 변경 실패:', err);
      showAlert('이름을 변경하는 중 오류가 발생했습니다.');
      return;
    }
    setScenarios(prev => prev.map(s => (s.id === id ? { ...s, fileName: trimmed } : s)));
    setRenamingScenarioId(null);
    setRenameDraft('');
  };

  // 알람 클릭 시 그리드에서 스크롤 이동 + 배경색으로 표시할 설비 ID (전체보기 표에서만 동작)
  const [clickHighlightId, setClickHighlightId] = useState(null);
  const clickHighlightTimeoutRef = useRef(null);
  useEffect(() => {
    return () => {
      if (clickHighlightTimeoutRef.current) clearTimeout(clickHighlightTimeoutRef.current);
    };
  }, []);
  const scrollToAndHighlightEquip = useCallback((equipId) => {
    const rowEl = document.getElementById(`equip-row-${equipId}`);
    if (rowEl) {
      rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    setClickHighlightId(equipId);
    if (clickHighlightTimeoutRef.current) clearTimeout(clickHighlightTimeoutRef.current);
    clickHighlightTimeoutRef.current = setTimeout(() => {
      setClickHighlightId(null);
    }, 1500);
  }, []);
  const handleAlarmClick = useCallback((alarm) => {
    scrollToAndHighlightEquip(alarm.equipId);
  }, [scrollToAndHighlightEquip]);

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

  const fileInputRef = useRef(null);
  const prevElapsedRef = useRef(0);

  // 설비별 이력 표 가상 스크롤 (행이 몇 만 개씩 쌓이면 DOM에 전부 그려놓는 것만으로도 스크롤이
  // 심하게 렉걸려서, 화면에 실제로 보이는 구간 근처만 <tr>로 렌더링하고 위아래는 빈 여백으로 채움)
  const HISTORY_ROW_HEIGHT = 44;
  const HISTORY_OVERSCAN = 8;
  const historyScrollRef = useRef(null);
  const [historyScrollTop, setHistoryScrollTop] = useState(0);
  const [historyViewportHeight, setHistoryViewportHeight] = useState(400);
  const handleHistoryScroll = (e) => setHistoryScrollTop(e.currentTarget.scrollTop);

  const selectedScenario = scenarios.find(s => s.id === selectedScenarioId) || null;

  // 등록된 시나리오 목록 새로고침
  const loadScenarios = async () => {
    try {
      const list = await listScenarios(user?.token);
      list.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
      setScenarios(list);
      return list;
    } catch (err) {
      console.error('시나리오 목록 조회 실패:', err);
      return [];
    } finally {
      setIsLoadingScenarios(false);
    }
  };

  useEffect(() => {
    loadScenarios();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.token]);

  // 재생 상태를 완전히 초기화 (시나리오 변경 / 정지 시 공통)
  const resetPlayback = () => {
    setPlayState('stopped');
    setElapsedMs(0);
    prevElapsedRef.current = 0;
    setEditedValues({});
    setUndoStack([]);
    lastEditKeyRef.current = null;
    setSimAlarms([]);
    setSimLogs([]);
    setSelectedEquipId(null);
    setViewEquipId('');
  };

  const loadSelectedScenario = async (scenario) => {
    resetPlayback();
    setSelectedScenarioId(scenario.id);
    setIsLoadingDetail(true);
    try {
      const detail = await getScenarioDetail(scenario.id, user?.token);
      setRows(detail.rows || []);
    } catch (err) {
      console.error('시나리오 상세 조회 실패:', err);
      showAlert('시나리오를 불러오는 중 오류가 발생했습니다.');
      setRows([]);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  // 저장하지 않은 수정 사항이 있는 상태에서 다른 시나리오로 넘어가면 그 내용이 사라지므로 먼저 확인
  const handleSelectScenario = (scenario) => {
    if (scenario.id === selectedScenarioId) return;
    if (Object.keys(editedValues).length > 0) {
      askConfirm('저장하지 않고 나가시겠습니까?', () => loadSelectedScenario(scenario));
    } else {
      loadSelectedScenario(scenario);
    }
  };

  const handleDeleteScenario = (e, id) => {
    e.stopPropagation();
    askConfirm('이 시뮬레이션 시나리오를 삭제하시겠습니까?', async () => {
      try {
        await deleteScenarioApi(id, user?.token);
      } catch (err) {
        console.error('시나리오 삭제 실패:', err);
        showAlert('시나리오 삭제 중 오류가 발생했습니다.');
        return;
      }
      if (selectedScenarioId === id) {
        resetPlayback();
        setSelectedScenarioId(null);
        setRows([]);
      }
      await loadScenarios();
    });
  };

  // 재생 구간의 시작 시각
  const startTimeMs = rows.length ? rows[0].time.getTime() : 0;

  // 데이터가 아예 없는 구간(기본 1시간 이상)은 재생 시간(durationMs)에서 통째로 빼기 위한
  // "압축 타임라인". 실제 시각(real) <-> 압축된 재생 경과시간(compressed)을 서로 변환할 수 있게
  // 데이터가 있는 연속 구간별로 압축된 타임라인상의 시작 위치를 미리 계산해둠. 재생/탐색/그래프 등
  // elapsedMs를 쓰는 곳은 전부 이 압축된 값을 기준으로 동작함
  const globalSortedTimes = useMemo(() => (
    rows.map(r => r.time.getTime()).sort((a, b) => a - b)
  ), [rows]);
  const timelineSegments = useMemo(() => {
    if (!globalSortedTimes.length) return [];
    const segments = [];
    let segStart = globalSortedTimes[0];
    let segRealEnd = globalSortedTimes[0];
    let compressedCursor = 0;
    for (let i = 1; i < globalSortedTimes.length; i++) {
      const t = globalSortedTimes[i];
      if (t - segRealEnd >= GAP_THRESHOLD_MS) {
        segments.push({ realStart: segStart, realEnd: segRealEnd, compressedStart: compressedCursor });
        compressedCursor += segRealEnd - segStart;
        segStart = t;
      }
      segRealEnd = t;
    }
    segments.push({ realStart: segStart, realEnd: segRealEnd, compressedStart: compressedCursor });
    return segments;
  }, [globalSortedTimes]);
  const durationMs = timelineSegments.length
    ? timelineSegments[timelineSegments.length - 1].compressedStart
      + (timelineSegments[timelineSegments.length - 1].realEnd - timelineSegments[timelineSegments.length - 1].realStart)
    : 0;
  // 실제 시각 -> 압축된 경과시간 (구간을 이진 탐색으로 찾음). 시간이 구간 사이 빈 곳(gap)에
  // 떨어지면 그 직전 구간이 끝나는 지점(gap이 없는 것처럼)으로 스냅함
  const realToCompressed = useCallback((realMs) => {
    if (!timelineSegments.length) return 0;
    let lo = 0, hi = timelineSegments.length - 1, idx = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (timelineSegments[mid].realStart <= realMs) { idx = mid; lo = mid + 1; } else hi = mid - 1;
    }
    const seg = timelineSegments[idx];
    const clamped = Math.min(Math.max(realMs, seg.realStart), seg.realEnd);
    return seg.compressedStart + (clamped - seg.realStart);
  }, [timelineSegments]);
  // 압축된 경과시간 -> 실제 시각
  const compressedToReal = useCallback((compressedMs) => {
    if (!timelineSegments.length) return startTimeMs;
    let lo = 0, hi = timelineSegments.length - 1, idx = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (timelineSegments[mid].compressedStart <= compressedMs) { idx = mid; lo = mid + 1; } else hi = mid - 1;
    }
    const seg = timelineSegments[idx];
    return seg.realStart + (compressedMs - seg.compressedStart);
  }, [timelineSegments, startTimeMs]);

  // 시나리오에 온도/전력 중 뭐가 있는지 (있는 지표만 값/컬럼/그래프에 표시)
  const hasTemperatureData = rows.some(r => r.temperature != null);
  const hasPowerData = rows.some(r => r.power != null);

  // 설비별 상태 전환 이벤트를 경과시간(ms) 기준으로 미리 계산. 온도/전력을 따로 훑어야
  // r.status(온도 기준)만으로는 전력 단독 초과를 못 잡음
  const transitionEvents = useMemo(() => {
    if (!rows.length) return [];
    const byEquip = new Map();
    rows.forEach(r => {
      if (!byEquip.has(r.equipId)) byEquip.set(r.equipId, []);
      byEquip.get(r.equipId).push(r);
    });

    const events = [];
    const pushTransitions = (sorted, metric, statusKey, valueKey, thresholdKey) => {
      let prevStatus = null;
      sorted.forEach(r => {
        const status = r[statusKey];
        if (status !== prevStatus) {
          if (isWarningStatus(status)) {
            events.push({
              id: `${metric}-${r.equipId}-${r.time.getTime()}`,
              equipId: r.equipId,
              equipName: r.equipName,
              location: r.location,
              elapsedMs: realToCompressed(r.time.getTime()),
              kind: 'warning',
              status,
              metric,
              value: r[valueKey],
              threshold: r[thresholdKey],
            });
          } else if (prevStatus && isWarningStatus(prevStatus)) {
            events.push({
              id: `log-${metric}-${r.equipId}-${r.time.getTime()}`,
              equipId: r.equipId,
              equipName: r.equipName,
              elapsedMs: realToCompressed(r.time.getTime()),
              kind: 'success',
              metric,
              value: r[valueKey],
              threshold: r[thresholdKey],
            });
          }
        }
        prevStatus = status;
      });
    };

    byEquip.forEach((list) => {
      const sorted = [...list].sort((a, b) => a.time.getTime() - b.time.getTime());
      if (hasTemperatureData) pushTransitions(sorted, 'temperature', 'status', 'temperature', 'threshold');
      if (hasPowerData) pushTransitions(sorted, 'power', 'powerStatus', 'power', 'powerThreshold');
    });
    events.sort((a, b) => a.elapsedMs - b.elapsedMs);
    return events;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, hasTemperatureData, hasPowerData]);

  // 재생바 채움 비율 (%) - 커스텀 트랙 배경(그라데이션)으로 진행 표시를 직접 그릴 때 사용
  const seekFillPct = durationMs > 0 ? (Math.min(elapsedMs, durationMs) / durationMs) * 100 : 0;

  const toAlarmCard = (e) => ({
    id: e.id,
    equipId: e.equipId,
    equipName: e.equipName,
    time: formatMmSs(e.elapsedMs),
    value: e.value,
    threshold: e.threshold,
    location: e.location || '-',
    metric: e.metric,
  });
  const toLogCard = (e) => ({
    id: `log-${e.id}`,
    time: formatMmSs(e.elapsedMs),
    type: e.kind,
    equipName: e.equipName,
    message: e.kind === 'warning'
      ? (e.status === '위험' ? '임계값 초과 감지' : '임계값 근접 감지')
      : '정상 범위로 복구됨',
    value: e.value,
    threshold: e.threshold,
    metric: e.metric,
  });

  // transitionEvents는 elapsedMs 오름차순으로 정렬돼 있으므로, 매 틱(250ms)마다 전체를
  // filter로 훑는 대신 이진 탐색으로 구간의 경계 인덱스만 찾아 slice함. 전환 이벤트가 많은
  // (일주일치 같은) 시나리오는 재생 내내 매 틱 O(n) 스캔 비용이 그대로 쌓여 갈수록 버벅였음
  const upperBoundByElapsedMs = (value) => {
    let lo = 0;
    let hi = transitionEvents.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (transitionEvents[mid].elapsedMs <= value) lo = mid + 1; else hi = mid;
    }
    return lo;
  };

  // 재생 위치(elapsedMs)가 바뀔 때마다 지금까지 발생한 전환 이벤트를 알람/로그에 반영
  useEffect(() => {
    if (!rows.length) return;
    const prev = prevElapsedRef.current;
    if (elapsedMs < prev) {
      // 되감기(스크럽): 처음부터 현재 위치까지 다시 계산
      const upto = transitionEvents.slice(0, upperBoundByElapsedMs(elapsedMs));
      setSimAlarms(upto.filter(e => e.kind === 'warning').map(toAlarmCard).slice(-MAX_SIM_ALARMS));
      setSimLogs(upto.map(toLogCard).slice(-MAX_SIM_LOGS));
    } else if (elapsedMs > prev) {
      const newly = transitionEvents.slice(upperBoundByElapsedMs(prev), upperBoundByElapsedMs(elapsedMs));
      if (newly.length > 0) {
        setSimAlarms(p => [...p, ...newly.filter(e => e.kind === 'warning').map(toAlarmCard)].slice(-MAX_SIM_ALARMS));
        setSimLogs(p => [...p, ...newly.map(toLogCard)].slice(-MAX_SIM_LOGS));
      }
    }
    prevElapsedRef.current = elapsedMs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsedMs, transitionEvents]);

  // 재생 타이머 - durationMs/elapsedMs가 이미 빈 구간이 빠진 "압축된" 시간이라 여기서 따로
  // 건너뛸 필요 없이 그냥 일정하게 흘려보내면 됨
  useEffect(() => {
    if (playState !== 'playing' || !rows.length || durationMs <= 0) return;
    const tickMs = 250;
    const intervalId = setInterval(() => {
      setElapsedMs(prev => {
        const next = prev + tickMs * speed;
        if (next >= durationMs) {
          setPlayState('paused');
          return durationMs;
        }
        return next;
      });
    }, tickMs);
    return () => clearInterval(intervalId);
  }, [playState, speed, durationMs, rows.length]);

  const handlePlayPause = () => {
    if (!rows.length) return;
    if (playState === 'playing') {
      setPlayState('paused');
      return;
    }
    if (elapsedMs >= durationMs) {
      setElapsedMs(0);
      prevElapsedRef.current = 0;
      setSimAlarms([]);
      setSimLogs([]);
    }
    setPlayState('playing');
  };

  const handleStop = () => {
    resetPlayback();
  };

  // 재생바를 드래그하면 <input type="range">의 onChange가 프레임당 여러 번(브라우저가 보낼 수
  // 있는 만큼 빠르게) 연달아 발생하는데, 그때마다 setElapsedMs를 바로 호출하면 currentEquipRows/
  // selectedEquipSeries 같은 무거운 재계산이 그 횟수만큼 겹쳐 실행돼서(재생 중 250ms 간격보다
  // 훨씬 잦음) 데이터가 많은 시나리오는 드래그 중 화면이 멈춘 것처럼 보였음. 실제 반영은 프레임당
  // 최대 1번으로 묶고, 그사이 들어온 값 중 가장 최신 값만 씀
  const pendingSeekRef = useRef(null);
  const seekRafScheduledRef = useRef(false);
  const handleSeek = (e) => {
    pendingSeekRef.current = Number(e.target.value);
    if (seekRafScheduledRef.current) return;
    seekRafScheduledRef.current = true;
    requestAnimationFrame(() => {
      seekRafScheduledRef.current = false;
      setElapsedMs(pendingSeekRef.current);
    });
  };

  // timeMs에 적용될 수정값 조회: 정확히 그 시각의 수정 우선, 없으면 그 이전 "이후 전체 적용" 중 최신 값
  const resolveEditedValue = (equipId, field, timeMs) => {
    const fieldEdits = editedValues[equipId]?.[field];
    if (!fieldEdits) return undefined;
    const exact = fieldEdits[timeMs];
    if (exact !== undefined) return exact.value;
    let latestForward;
    Object.keys(fieldEdits).forEach(t => {
      const editTime = Number(t);
      const edit = fieldEdits[t];
      if (edit.forward && editTime <= timeMs && (!latestForward || editTime > latestForward.time)) {
        latestForward = { time: editTime, value: edit.value };
      }
    });
    return latestForward?.value;
  };

  // equipId별로 시간 오름차순 정렬된 배열로 미리 인덱싱 (rows 변경 시 한 번만 계산).
  // 재생 중 250ms마다 도는 currentEquipRows가 이걸 이진 탐색으로 훑어서, 데이터가 아주 많아도
  // (예: 일주일치 엑셀) 매 tick마다 전체를 다시 스캔하지 않게 함 - 안 그러면 재생 중 브라우저가 멈춤
  const sortedRowsByEquip = useMemo(() => {
    const map = new Map();
    rows.forEach(r => {
      if (!map.has(r.equipId)) map.set(r.equipId, []);
      map.get(r.equipId).push(r);
    });
    map.forEach(list => list.sort((a, b) => a.time.getTime() - b.time.getTime()));
    return map;
  }, [rows]);

  // 정렬된 배열에서 time <= cutoff인 가장 마지막(최신) 원소를 이진 탐색으로 찾음
  const findLatestAtOrBefore = (sortedList, cutoff) => {
    let lo = 0;
    let hi = sortedList.length - 1;
    let result = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (sortedList[mid].time.getTime() <= cutoff) {
        result = sortedList[mid];
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return result;
  };

  // 현재 재생 시점 기준, 설비별 가장 최근 값(수동 수정값 있으면 그 값으로 덮어씀)
  const currentEquipRows = useMemo(() => {
    if (!rows.length) return [];
    const cutoff = compressedToReal(elapsedMs);
    const latestByEquip = new Map();
    sortedRowsByEquip.forEach((list, equipId) => {
      const latest = findLatestAtOrBefore(list, cutoff);
      if (latest) latestByEquip.set(equipId, latest);
    });

    return Array.from(latestByEquip.values())
      .map(r => {
        const rowTime = r.time.getTime();
        const editedTemp = resolveEditedValue(r.equipId, 'temperature', rowTime);
        const editedPower = resolveEditedValue(r.equipId, 'power', rowTime);
        const editedThreshold = resolveEditedValue(r.equipId, 'threshold', rowTime);
        const editedPowerThreshold = resolveEditedValue(r.equipId, 'powerThreshold', rowTime);
        const temperature = editedTemp !== undefined ? editedTemp : r.temperature;
        const power = editedPower !== undefined ? editedPower : r.power;
        const threshold = editedThreshold !== undefined ? editedThreshold : r.threshold;
        const powerThreshold = editedPowerThreshold !== undefined ? editedPowerThreshold : r.powerThreshold;
        const status = (editedTemp !== undefined || editedThreshold !== undefined || editedPower !== undefined || editedPowerThreshold !== undefined)
          ? computeCombinedStatus(temperature, threshold, power, powerThreshold)
          : r.status;
        const powerStatus = (editedPower !== undefined || editedPowerThreshold !== undefined)
          ? computeStatus(power, powerThreshold)
          : r.powerStatus;
        return { ...r, temperature, power, threshold, powerThreshold, status, powerStatus };
      })
      .sort((a, b) => {
        if (!sortColumn) return compareByEquipId(a, b);
        const dir = sortDirection === 'asc' ? 1 : -1;
        let cmp;
        switch (sortColumn) {
          case 'equipName':
            cmp = String(a.equipName ?? '').localeCompare(String(b.equipName ?? ''));
            break;
          case 'location':
            cmp = String(a.location ?? '').localeCompare(String(b.location ?? ''));
            break;
          case 'time':
            cmp = a.time.getTime() - b.time.getTime();
            break;
          case 'temperature':
            cmp = (a.temperature ?? -Infinity) - (b.temperature ?? -Infinity);
            break;
          case 'power':
            cmp = (a.power ?? -Infinity) - (b.power ?? -Infinity);
            break;
          case 'threshold':
            cmp = (a.threshold ?? -Infinity) - (b.threshold ?? -Infinity);
            break;
          case 'powerThreshold':
            cmp = (a.powerThreshold ?? -Infinity) - (b.powerThreshold ?? -Infinity);
            break;
          case 'status':
            cmp = STATUS_SORT_ORDER[a.status] - STATUS_SORT_ORDER[b.status];
            break;
          case 'powerStatus':
            cmp = STATUS_SORT_ORDER[a.powerStatus] - STATUS_SORT_ORDER[b.powerStatus];
            break;
          default:
            cmp = compareByEquipId(a, b);
        }
        return cmp * dir;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sortedRowsByEquip, elapsedMs, editedValues, startTimeMs, sortColumn, sortDirection]);

  // 설비별 전체 상태 흐름을 온도/전력 각각 색 구간으로 미리 계산 (elapsedMs 무관, 한 번만)
  const equipTimelines = useMemo(() => {
    if (!rows.length || durationMs <= 0) return {};
    const byEquip = new Map();
    rows.forEach(r => {
      if (!byEquip.has(r.equipId)) byEquip.set(r.equipId, []);
      byEquip.get(r.equipId).push(r);
    });

    // 막대 너비 비율은 압축된(빈 구간 뺀) 시간 기준으로 계산해야 durationMs와 맞음 -
    // 실제 시각을 그대로 쓰면 빈 구간을 포함한 실제 간격이 압축된 총 길이로 나눠지면서
    // 그 구간의 너비가 실제보다 훨씬 크게 부풀어 보임
    const scenarioEndReal = rows.length ? rows[rows.length - 1].time.getTime() : startTimeMs;
    const buildSegments = (resolved) => {
      const segments = [];
      resolved.forEach((point, idx) => {
        // 첫 구간은 startTimeMs부터 채워서 막대 길이가 항상 100%로 보이게 함
        const segStartReal = idx === 0 ? startTimeMs : point.time;
        const segEndReal = idx < resolved.length - 1 ? resolved[idx + 1].time : scenarioEndReal;
        const segStart = realToCompressed(segStartReal);
        const segEnd = realToCompressed(segEndReal);
        const widthPct = ((segEnd - segStart) / durationMs) * 100;
        if (widthPct <= 0) return;
        const last = segments[segments.length - 1];
        if (last && last.color === point.color) {
          last.widthPct += widthPct;
        } else {
          segments.push({ color: point.color, widthPct });
        }
      });
      return segments;
    };

    const result = {};
    byEquip.forEach((list, equipId) => {
      const sorted = [...list].sort((a, b) => a.time.getTime() - b.time.getTime());
      const resolvedTemp = sorted.map(r => {
        const rowTime = r.time.getTime();
        const editedTemp = resolveEditedValue(equipId, 'temperature', rowTime);
        const editedThreshold = resolveEditedValue(equipId, 'threshold', rowTime);
        const temperature = editedTemp !== undefined ? editedTemp : r.temperature;
        const threshold = editedThreshold !== undefined ? editedThreshold : r.threshold;
        const status = (editedTemp !== undefined || editedThreshold !== undefined) ? computeStatus(temperature, threshold) : r.status;
        return { time: rowTime, color: getStatusMeta(status).color };
      });
      const resolvedPower = sorted.map(r => {
        const rowTime = r.time.getTime();
        const editedPower = resolveEditedValue(equipId, 'power', rowTime);
        const editedPowerThreshold = resolveEditedValue(equipId, 'powerThreshold', rowTime);
        const power = editedPower !== undefined ? editedPower : r.power;
        const powerThreshold = editedPowerThreshold !== undefined ? editedPowerThreshold : r.powerThreshold;
        const status = computeStatus(power, powerThreshold);
        return { time: rowTime, color: getStatusMeta(status).color };
      });
      result[equipId] = { temperature: buildSegments(resolvedTemp), power: buildSegments(resolvedPower) };
    });
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, editedValues, startTimeMs, durationMs]);

  // 선택한 설비의 "지금까지" 추이 (재생 위치가 앞으로 갈수록 점이 이어져 그려짐).
  // rows 전체를 매 tick(250ms)마다 훑지 않도록, 정렬된 인덱스에서 이진 탐색으로 cutoff까지의
  // 구간만 잘라서 씀 (전체 rows.filter는 데이터가 많을 때 재생 중 렉의 원인이었음)
  const selectedEquipSeries = useMemo(() => {
    if (!selectedEquipId || !rows.length) return [];
    const cutoff = compressedToReal(elapsedMs);
    const sortedList = sortedRowsByEquip.get(selectedEquipId) || [];
    const endIdx = (() => {
      let lo = 0;
      let hi = sortedList.length - 1;
      let result = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (sortedList[mid].time.getTime() <= cutoff) { result = mid; lo = mid + 1; }
        else { hi = mid - 1; }
      }
      return result;
    })();
    // 위 이진 탐색은 "경계를 찾는 것"만 빠르게 했을 뿐, 그동안 slice(0, endIdx+1)로 재생 시작부터
    // 지금까지의 전 구간을 그대로 다시 map 돌리고 있었음 - 재생이 진행될수록(=endIdx가 커질수록)
    // 이 작업 자체가 매 틱 점점 더 무거워져서, 데이터가 많은 시나리오는 뒤로 갈수록 심하게
    // 버벅이다 못해 멈춘 것처럼 보였음(가장 큰 원인). 상한을 넘으면 균등 간격으로 표본을 뽑아
    // 그래프 모양은 그대로 유지하면서 매 틱 처리량을 일정하게 묶어둠
    const totalCount = endIdx + 1;
    let sourceList;
    if (totalCount <= MAX_SERIES_POINTS) {
      sourceList = sortedList.slice(0, totalCount);
    } else {
      const step = totalCount / MAX_SERIES_POINTS;
      sourceList = Array.from({ length: MAX_SERIES_POINTS }, (_, i) => sortedList[Math.floor(i * step)]);
      const last = sortedList[totalCount - 1];
      if (sourceList[sourceList.length - 1] !== last) sourceList[sourceList.length - 1] = last;
    }
    let prevStatus = null;
    return sourceList
      .map(r => {
        const rowTime = r.time.getTime();
        const editedTemp = resolveEditedValue(r.equipId, 'temperature', rowTime);
        const editedPower = resolveEditedValue(r.equipId, 'power', rowTime);
        const editedThreshold = resolveEditedValue(r.equipId, 'threshold', rowTime);
        const editedPowerThreshold = resolveEditedValue(r.equipId, 'powerThreshold', rowTime);
        // 경고/위험 상태가 "새로 시작된" 지점에만 원 마커를 표시 (계속 경고 상태인 구간은 표시 안 함)
        const isWarning = isWarningStatus(r.status) && !isWarningStatus(prevStatus);
        prevStatus = r.status;
        return {
          time: formatClockTime(r.time),
          elapsedMs: realToCompressed(rowTime),
          temperature: editedTemp !== undefined ? editedTemp : r.temperature,
          power: editedPower !== undefined ? editedPower : r.power,
          threshold: editedThreshold !== undefined ? editedThreshold : r.threshold,
          powerThreshold: editedPowerThreshold !== undefined ? editedPowerThreshold : r.powerThreshold,
          isWarning,
        };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sortedRowsByEquip, selectedEquipId, elapsedMs, editedValues, startTimeMs]);

  // 셀 직접 수정 - applyForward 꺼짐: 그 시각만(스파이크), 켜짐: 그 시각 이후 전체 적용.
  // 값이 바뀌면 즉시 재판정해서 새로 경고/위험 진입 시 알람에도 반영
  const handleCellValueEdit = (row, field, rawValue) => {
    const equipId = row.equipId;
    const anchorTime = row.time.getTime();
    const newValue = rawValue === '' ? '' : Number(rawValue);

    // 같은 셀 연속 타이핑은 되돌리기 한 단계로 묶고, 다른 셀로 넘어갈 때만 스택에 쌓음
    const editKey = `${equipId}|${field}|${anchorTime}`;
    if (lastEditKeyRef.current !== editKey) {
      setUndoStack(prev => [...prev, editedValues].slice(-50));
      lastEditKeyRef.current = editKey;
    }

    setEditedValues(prev => {
      const equipEdits = prev[equipId] || {};
      const fieldEdits = { ...(equipEdits[field] || {}) };
      if (newValue === '') {
        delete fieldEdits[anchorTime];
      } else {
        fieldEdits[anchorTime] = { value: newValue, forward: applyForward };
      }
      return { ...prev, [equipId]: { ...equipEdits, [field]: fieldEdits } };
    });

    // 온도/전력 수정을 독립적으로 판정 (온도만 상태를 좌우하면 전력 초과가 감지 안 되는 문제 방지)
    const isTempField = field === 'temperature' || field === 'threshold';
    const isPowerField = field === 'power' || field === 'powerThreshold';
    if (!isTempField && !isPowerField) return;
    if (newValue === '' || isNaN(newValue)) return;

    const temperature = field === 'temperature' ? newValue : row.temperature;
    const threshold = field === 'threshold' ? newValue : row.threshold;
    const power = field === 'power' ? newValue : row.power;
    const powerThreshold = field === 'powerThreshold' ? newValue : row.powerThreshold;

    const metric = isTempField ? 'temperature' : 'power';
    const newStatus = isTempField ? computeStatus(temperature, threshold) : computeStatus(power, powerThreshold);
    const prevStatus = isTempField ? row.status : row.powerStatus;
    const alarmValue = isTempField ? temperature : power;
    const alarmThreshold = isTempField ? threshold : powerThreshold;

    if (isWarningStatus(newStatus) && newStatus !== prevStatus) {
      // 재생 중 자동으로 감지된 알람/로그는 시나리오 경과시간(mm:ss)으로 표시되는데, 수동 수정은
      // 지금까지 실제 현재 시각(수정한 시점의 벽시계 시각)으로 표시되고 있어서 서로 형식이 달랐음.
      // 수정한 행 자체의 시나리오 경과시간으로 통일함
      const editedAt = new Date();
      const timeLabel = formatMmSs(realToCompressed(row.time.getTime()));
      const cardId = `manual-${metric}-${equipId}-${editedAt.getTime()}`;
      setSimAlarms(p => [...p, {
        id: cardId,
        equipId,
        equipName: row.equipName,
        time: timeLabel,
        value: alarmValue,
        threshold: alarmThreshold,
        location: row.location || '-',
        metric,
      }].slice(-MAX_SIM_ALARMS));
      setSimLogs(p => [...p, {
        id: `log-${cardId}`,
        time: timeLabel,
        type: 'warning',
        equipName: row.equipName,
        message: `${newStatus === '위험' ? '임계값 초과 감지' : '임계값 근접 감지'} (${newStatus}) [수동 수정 - ${formatClockTime(editedAt)} 편집]`,
        value: alarmValue,
        threshold: alarmThreshold,
        metric,
      }].slice(-MAX_SIM_LOGS));
    }
  };

  // 셀 수정 되돌리기 - 되돌리기 스택의 마지막 스냅샷으로 editedValues를 복원
  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    setEditedValues(last);
    setUndoStack(prev => prev.slice(0, -1));
    lastEditKeyRef.current = null;
  };

  const handleDismissAlarm = (id) => {
    setSimAlarms(prev => prev.filter(a => a.id !== id));
  };

  // 지금 보고 있는 지표(온도/전력)의 알람만 지움 - 다른 지표 알람은 그대로 둠
  const handleClearAlarms = (metric) => {
    if (!metric) { setSimAlarms([]); return; }
    setSimAlarms(prev => prev.filter(a => (a.metric || 'temperature') !== metric));
  };

  // 시나리오 파일 여러 개를 순서대로 파싱 -> 백엔드 저장, 마지막 파일을 자동 선택
  const handleFilesUpload = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setIsUploadingFile(true);
    let lastSaved = null;
    let lastParsedRows = null;
    const failedNames = [];
    try {
      for (const file of files) {
        try {
          const { rows: parsedRows, missingTimeCount } = await parseSimulationFileInWorker(file);
          if (parsedRows.length === 0) {
            failedNames.push(file.name);
            continue;
          }
          if (missingTimeCount === parsedRows.length) {
            showAlert(`"${file.name}": 수신 시간 컬럼을 찾을 수 없어 업로드 순서 기준으로 임시 시간이 부여됩니다.`);
          }
          const saved = await uploadScenario(file.name, parsedRows, user?.token);
          lastSaved = saved;
          lastParsedRows = parsedRows;
        } catch (err) {
          console.error(`시뮬레이션 파일 업로드 실패 (${file.name}):`, err);
          failedNames.push(file.name);
        }
      }
      await loadScenarios();
      if (lastSaved) {
        resetPlayback();
        setSelectedScenarioId(lastSaved.id);
        setRows(lastSaved.rows || lastParsedRows);
      }
      if (failedNames.length > 0) {
        showAlert(`다음 파일은 업로드하지 못했습니다 (ID 컬럼 등을 확인해 주세요): ${failedNames.join(', ')}`);
      }
    } finally {
      setIsUploadingFile(false);
    }
  };

  const handleFileInputChange = (e) => {
    handleFilesUpload(e.target.files);
    e.target.value = '';
  };

  // 지금까지의 수정을 각 행에 반영한 전체 rows 계산 (수정 안 한 행은 원본 유지)
  const getRowsWithEdits = () => {
    return rows.map(r => {
      const rowTime = r.time.getTime();
      const editedTemp = resolveEditedValue(r.equipId, 'temperature', rowTime);
      const editedPower = resolveEditedValue(r.equipId, 'power', rowTime);
      const editedThreshold = resolveEditedValue(r.equipId, 'threshold', rowTime);
      const editedPowerThreshold = resolveEditedValue(r.equipId, 'powerThreshold', rowTime);
      if (editedTemp === undefined && editedPower === undefined && editedThreshold === undefined && editedPowerThreshold === undefined) return r;
      const temperature = editedTemp !== undefined ? editedTemp : r.temperature;
      const power = editedPower !== undefined ? editedPower : r.power;
      const threshold = editedThreshold !== undefined ? editedThreshold : r.threshold;
      const powerThreshold = editedPowerThreshold !== undefined ? editedPowerThreshold : r.powerThreshold;
      return {
        ...r,
        temperature,
        power,
        threshold,
        powerThreshold,
        status: computeCombinedStatus(temperature, threshold, power, powerThreshold),
        powerStatus: computeStatus(power, powerThreshold),
      };
    });
  };

  // 현재 수정된 셀 값을 시나리오 원본에 반영해서 백엔드에 저장
  const handleSaveScenario = async () => {
    if (!selectedScenario) {
      showAlert('저장할 시나리오를 먼저 선택하세요.');
      return;
    }

    const updatedRows = getRowsWithEdits();

    setIsSavingScenario(true);
    try {
      await updateScenarioRows(selectedScenarioId, updatedRows, user?.token);
    } catch (err) {
      console.error('시나리오 저장 실패:', err);
      showAlert('시나리오를 저장하는 중 오류가 발생했습니다.');
      return;
    } finally {
      setIsSavingScenario(false);
    }
    setRows(updatedRows);
    setEditedValues({});
    setUndoStack([]);
    lastEditKeyRef.current = null;
    showAlert('저장되었습니다.');
    loadScenarios();
  };

  // 현재 화면에 보이는 데이터(수정 중인 값 포함)를 CSV 파일로 내보내기 (저장 여부와 무관).
  // 행이 많을 때 텍스트 조립 자체가 꽤 무거운데 지금까지 메인 스레드에서 그대로 돌려서 그동안
  // 로딩 표시 하나 없이 화면이 멈췄음 - 업로드 파싱 때와 같은 이유로 워커에서 처리하고,
  // 그동안 스피너를 보여줌
  const handleExportScenario = () => {
    if (!selectedScenario) {
      showAlert('내보낼 시나리오를 먼저 선택하세요.');
      return;
    }

    const exportRows = getRowsWithEdits();

    const exportData = exportRows.map(r => ({
      'ID': `#${r.equipId}`,
      '설비명': r.equipName,
      '위치': r.location || '-',
      '수신 시간': formatKoreanDateTime(r.time),
      '온도': r.temperature != null && !isNaN(r.temperature) ? Number(r.temperature).toFixed(1) : '-',
      '전력': r.power != null && !isNaN(r.power) ? Number(r.power).toFixed(1) : '-',
      '임계값(온도)': r.threshold,
      '전력임계값': r.powerThreshold,
      '상태': r.status,
    }));
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = today.toTimeString().slice(0, 5).replace(':', '');
    const baseName = selectedScenario.fileName.replace(/\.(xlsx|xls)$/i, '');
    const fileName = `${baseName}_수정_${dateStr}_${timeStr}.csv`;

    setIsExportingFile(true);
    exportToCsv(exportData, fileName)
      .catch(err => {
        console.error('CSV 내보내기 실패:', err);
        showAlert('CSV 파일을 만드는 중 오류가 발생했습니다.');
      })
      .finally(() => setIsExportingFile(false));
  };

  // 현재 상태 기준 정상/경고/위험 개수 (알람 패널 하단 뱃지용). 알람 패널은 온도/전력 탭을
  // 자체적으로 관리해서 여기선 어느 탭이 보이는지 알 수 없으므로, 두 지표 각각의 개수를 다 계산해 넘김
  const countByStatus = (statusKey) => currentEquipRows.reduce((acc, eq) => {
    const label = getStatusMeta(eq[statusKey]).label;
    if (label === '위험') acc.danger += 1;
    else if (label === '경고') acc.warning += 1;
    else acc.normal += 1;
    return acc;
  }, { normal: 0, warning: 0, danger: 0 });
  const statusCounts = { temperature: countByStatus('status'), power: countByStatus('powerStatus') };

  const selectedEquipName = currentEquipRows.find(r => r.equipId === selectedEquipId)?.equipName;
  const displayedAlarms = selectedEquipName
    ? simAlarms.filter(a => a.equipName === selectedEquipName)
    : simAlarms;

  // 드롭다운에 표시할 시나리오 내 설비 목록 (중복 제거, 이름순)
  const equipOptions = useMemo(() => {
    const map = new Map();
    rows.forEach(r => { if (!map.has(r.equipId)) map.set(r.equipId, r.equipName); });
    return [...map.entries()]
      .map(([equipId, equipName]) => ({ equipId, equipName }))
      .sort((a, b) => String(a.equipName).localeCompare(String(b.equipName), 'ko'));
  }, [rows]);

  // 드롭다운에서 고른 설비의 전체 시간별 이력 (시간순, 읽기 전용).
  // viewEquipId가 아니라 한 박자 늦게 따라가는 displayViewEquipId를 써서, 로딩 표시가 먼저
  // 그려질 시간을 벌어줌 (안 그러면 이 무거운 계산이 같은 렌더에서 바로 실행돼 화면이 멈춤)
  const equipHistoryRows = useMemo(() => {
    if (!displayViewEquipId) return [];
    // rows 전체를 훑지 않고 이미 설비별로 정렬해둔 인덱스에서 바로 꺼냄 (드롭다운 클릭 시 렉의 원인)
    return (sortedRowsByEquip.get(displayViewEquipId) || [])
      .map(r => {
        const rowTime = r.time.getTime();
        const editedTemp = resolveEditedValue(r.equipId, 'temperature', rowTime);
        const editedPower = resolveEditedValue(r.equipId, 'power', rowTime);
        const editedThreshold = resolveEditedValue(r.equipId, 'threshold', rowTime);
        const editedPowerThreshold = resolveEditedValue(r.equipId, 'powerThreshold', rowTime);
        const temperature = editedTemp !== undefined ? editedTemp : r.temperature;
        const power = editedPower !== undefined ? editedPower : r.power;
        const threshold = editedThreshold !== undefined ? editedThreshold : r.threshold;
        const powerThreshold = editedPowerThreshold !== undefined ? editedPowerThreshold : r.powerThreshold;
        const status = (editedTemp !== undefined || editedThreshold !== undefined || editedPower !== undefined || editedPowerThreshold !== undefined)
          ? computeCombinedStatus(temperature, threshold, power, powerThreshold)
          : r.status;
        const powerStatus = (editedPower !== undefined || editedPowerThreshold !== undefined)
          ? computeStatus(power, powerThreshold)
          : r.powerStatus;
        return { ...r, temperature, power, threshold, powerThreshold, status, powerStatus };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedRowsByEquip, displayViewEquipId, editedValues]);

  // 설비별 이력 표에서, 지금 재생 위치에 해당하는 행(전체보기에 표시되는 것과 같은 행)을 테두리로 표시
  const currentViewEquipTime = currentEquipRows.find(r => r.equipId === viewEquipId)?.time?.getTime();

  // 테두리를 표시할 정확한 행의 인덱스 (이진 탐색). 같은 시각을 가진 행이 여러 개 있을 수 있어서
  // 시간 값만으로 비교하면 그 시각을 가진 행 전부에 테두리가 걸림 - 인덱스 하나로만 비교해서
  // 정확히 그 행에만 표시되게 함
  const currentViewRowIdx = useMemo(() => {
    if (currentViewEquipTime == null) return -1;
    const list = sortedRowsByEquip.get(displayViewEquipId) || [];
    let lo = 0;
    let hi = list.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const midTime = list[mid].time.getTime();
      if (midTime === currentViewEquipTime) return mid;
      if (midTime < currentViewEquipTime) lo = mid + 1; else hi = mid - 1;
    }
    return -1;
  }, [currentViewEquipTime, sortedRowsByEquip, displayViewEquipId]);

  // 표 컨테이너 크기가 바뀌면(창 크기 조절 등) 가상 스크롤 계산에 반영
  useEffect(() => {
    const el = historyScrollRef.current;
    if (!el) return undefined;
    setHistoryViewportHeight(el.clientHeight);
    const observer = new ResizeObserver((entries) => {
      setHistoryViewportHeight(entries[0].contentRect.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [displayViewEquipId]);

  // 재생 위치가 바뀌어 테두리로 표시되는 행이 이동하면, 그 행이 보이도록 표를 자동으로 스크롤.
  // 가상 스크롤 때문에 그 행이 실제로 DOM에 없을 수도 있어서, ref로 찾는 대신 정렬된 배열에서
  // 이진 탐색으로 인덱스를 구해 스크롤 위치를 직접 계산함
  useEffect(() => {
    if (currentViewEquipTime == null) return;
    const el = historyScrollRef.current;
    if (!el) return;
    const list = sortedRowsByEquip.get(displayViewEquipId) || [];
    let lo = 0;
    let hi = list.length - 1;
    let idx = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const midTime = list[mid].time.getTime();
      if (midTime === currentViewEquipTime) { idx = mid; break; }
      if (midTime < currentViewEquipTime) lo = mid + 1; else hi = mid - 1;
    }
    // 정확히 일치하는 게 없어도(예: 방금 다른 설비로 전환하는 도중이라 리스트가 아직 안 맞물린
    // 경우) 그냥 포기하지 않고, 이진 탐색이 멈춘 자리(가장 가까운 위치)로라도 이동함 - 데이터가
    // 많을수록 정확히 못 맞고 그냥 아무것도 안 하는 경우가 잦아서 "안 움직이는 것처럼" 보였음
    if (idx === -1) idx = Math.max(0, Math.min(list.length - 1, lo));
    if (idx < 0) return;
    const rowTop = idx * HISTORY_ROW_HEIGHT;
    // 화면 정중앙이 아니라 위쪽 1/3 지점에 현재 위치 행이 오도록 (조금 더 위쪽에 걸리게)
    const target = Math.max(0, rowTop - el.clientHeight / 3 + HISTORY_ROW_HEIGHT / 2);

    // 재생 틱(250ms)마다 이 위치가 갱신되는데, 브라우저 기본 behavior:'smooth'는 애니메이션
    // 길이를 우리가 정할 수 없어서 다음 틱이 오기 전에 안 끝나면 서로 취소되며 안 움직이는
    // 것처럼 보였음(데이터가 많을수록 자주 발생). 그래서 직접 짧게(틱보다 확실히 짧게) 이징
    // 애니메이션을 돌리고, 다음 틱이 오면 cleanup에서 반드시 취소해 서로 안 겹치게 함
    const startTop = el.scrollTop;
    const distance = target - startTop;
    if (Math.abs(distance) < 1) return undefined;
    const duration = 180;
    const startTime = performance.now();
    let rafId = requestAnimationFrame(function step(now) {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - (1 - t) * (1 - t); // ease-out
      el.scrollTop = startTop + distance * eased;
      if (t < 1) rafId = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(rafId);
  }, [currentViewEquipTime, viewEquipId, sortedRowsByEquip, displayViewEquipId]);

  // 가상 스크롤: 실제로 화면에 보이는 구간(+여유분) 인덱스만 계산해서 그 부분만 <tr>로 렌더링
  const historyRowCount = equipHistoryRows.length;
  const historyStartIdx = Math.max(0, Math.floor(historyScrollTop / HISTORY_ROW_HEIGHT) - HISTORY_OVERSCAN);
  const historyVisibleCount = Math.ceil(historyViewportHeight / HISTORY_ROW_HEIGHT) + HISTORY_OVERSCAN * 2;
  const historyEndIdx = Math.min(historyRowCount, historyStartIdx + historyVisibleCount);
  const historyTopSpacerHeight = historyStartIdx * HISTORY_ROW_HEIGHT;
  const historyBottomSpacerHeight = (historyRowCount - historyEndIdx) * HISTORY_ROW_HEIGHT;
  const visibleHistoryRows = equipHistoryRows.slice(historyStartIdx, historyEndIdx);
  const historyColCount = 1 + (hasTemperatureData ? 3 : 0) + (hasPowerData ? 3 : 0);

  // 전체보기 표의 정렬 가능한 헤더 셀 (클릭 시 그 컬럼 기준 정렬, 다시 누르면 오름/내림차순 전환)
  const renderSortableHeader = (column, label, widthClass) => {
    const isActive = sortColumn === column;
    return (
      <th
        onClick={() => handleSortClick(column)}
        className={`${widthClass} px-3 border-b font-semibold uppercase cursor-pointer select-none transition-colors ${
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
    <div className={`w-full min-w-[320px] flex flex-col transition-colors min-h-[calc(100vh/1.1)] lg:h-[calc(100vh/1.1)] lg:max-h-[calc(1080px/1.1)] lg:overflow-hidden ${
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

      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        multiple
        onChange={handleFileInputChange}
        className="hidden"
      />

      <div className="flex-1 p-3 sm:p-4 md:p-6 flex flex-col gap-4 max-w-[1920px] mx-auto w-full lg:overflow-hidden lg:h-full">
        {/* 상단 컨트롤 영역 */}
        <div className={`flex flex-col gap-3 p-3 sm:p-4 rounded-xl shrink-0 border transition-colors ${
          isDarkMode ? 'bg-[#12172A] border-[#1E253D]' : 'bg-white border-gray-200 shadow-sm'
        }`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              {selectedScenario && renamingScenarioId === selectedScenario.id ? (
                <input
                  ref={titleRenameRef}
                  autoFocus
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') confirmRename(selectedScenario.id);
                    if (e.key === 'Escape') cancelRename();
                  }}
                  style={{ width: `max(${titleInputWidth ?? 160}px, ${renameDraft.length + 2}ch)`, minWidth: 160 }}
                  className={`text-base font-semibold px-2 py-1 rounded-lg border outline-none ${
                    isDarkMode ? 'bg-[#0D1224] border-[#22D3EE] text-[#EDF1FC]' : 'bg-white border-green-600 text-gray-800'
                  }`}
                />
              ) : (
                <button
                  type="button"
                  onClick={(e) => selectedScenario && startRename(e, selectedScenario)}
                  title={selectedScenario ? '클릭하면 이름을 수정할 수 있습니다' : undefined}
                  tabIndex={selectedScenario ? 0 : -1}
                  className={`relative self-start text-base font-semibold whitespace-nowrap pl-2 pr-5 py-1 rounded-lg border border-transparent transition-colors ${
                    selectedScenario ? 'cursor-pointer' : 'invisible pointer-events-none'
                  } ${
                    isDarkMode ? 'text-[#EDF1FC] hover:bg-[#0D1224] hover:border-[#232B45]' : 'text-gray-800 hover:bg-gray-50 hover:border-gray-200'
                  }`}
                >
                  {selectedScenario?.fileName || ' '}
                  <svg
                    className={`absolute top-0.5 right-0.5 w-3 h-3 ${isDarkMode ? 'text-[#5C6584]' : 'text-gray-400'}`}
                    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"
                  >
                    <path d="M16.862 4.487a2.06 2.06 0 112.914 2.914L8.5 18.677l-4 1 1-4L16.862 4.487z" />
                  </svg>
                </button>
              )}

              {/* 이 시나리오 데이터의 실제 시간 범위 (시작 ~ 끝) */}
              <span className={`text-[11px] font-mono whitespace-nowrap px-2 ${
                selectedScenario && rows.length > 0 ? '' : 'invisible'
              } ${isDarkMode ? 'text-[#7D87A8]' : 'text-gray-500'}`}>
                {selectedScenario && rows.length > 0
                  ? `${formatKoreanDateTime(startTimeMs)} ~ ${formatKoreanDateTime(rows[rows.length - 1].time.getTime())}`
                  : ' '}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* 셀 수정 시 적용 범위: 그 시점만 vs 그 시점 이후 전체 */}
              {selectedScenario && (
                <div className={`flex items-center rounded-lg border p-0.5 text-xs font-semibold ${
                  isDarkMode ? 'bg-[#0D1224] border-[#232B45]' : 'bg-white border-gray-300'
                }`}>
                  <button
                    type="button"
                    onClick={() => setApplyForward(false)}
                    title="셀을 수정하면 그 시점에만 값이 적용되고, 다음 데이터부터는 원래 값으로 돌아갑니다"
                    className={`px-2.5 py-1 rounded-md transition-colors ${
                      !applyForward
                        ? (isDarkMode ? 'bg-[#22D3EE] text-[#0A0E1A]' : 'bg-green-700 text-white')
                        : (isDarkMode ? 'text-[#9FACC9] hover:text-[#EDF1FC]' : 'text-gray-500 hover:text-gray-800')
                    }`}
                  >
                    현재 값만
                  </button>
                  <button
                    type="button"
                    onClick={() => setApplyForward(true)}
                    title="셀을 수정하면 그 시점 이후 모든 데이터에 값이 이어서 적용됩니다"
                    className={`px-2.5 py-1 rounded-md transition-colors ${
                      applyForward
                        ? (isDarkMode ? 'bg-[#22D3EE] text-[#0A0E1A]' : 'bg-green-700 text-white')
                        : (isDarkMode ? 'text-[#9FACC9] hover:text-[#EDF1FC]' : 'text-gray-500 hover:text-gray-800')
                    }`}
                  >
                    이후 전체 적용
                  </button>
                </div>
              )}

              {/* 설비별 전체 시간 이력 보기 드롭다운 (커스텀) */}
              {selectedScenario && equipOptions.length > 0 && (
                <Dropdown
                  value={viewEquipId}
                  onChange={(newVal) => {
                    setViewEquipId(newVal);
                    setSelectedEquipId(newVal || null);
                  }}
                  options={[
                    { value: '', label: '전체보기' },
                    ...equipOptions.map(eq => ({ value: eq.equipId, label: eq.equipName })),
                  ]}
                  isDarkMode={isDarkMode}
                  widthClass="w-[170px]"
                />
              )}

              <button
                onClick={() => fileInputRef.current?.click()}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold tracking-wide transition-colors border shrink-0 ${
                  isDarkMode
                    ? 'bg-[#0D1224] border-[#232B45] text-[#EDF1FC] hover:bg-[#151B30] hover:border-[#2A335A]'
                    : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-white hover:border-gray-300'
                }`}
              >
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 7.5m0 0L7.5 12m4.5-4.5v13.5" />
                </svg>
                업로드
              </button>
            </div>
          </div>

          {/* 재생 컨트롤 바 */}
          <div className={`flex flex-wrap items-center gap-3 pt-3 border-t ${isDarkMode ? 'border-[#1E253D]' : 'border-gray-200'}`}>
            <button
              onClick={handleStop}
              disabled={!rows.length}
              title="정지"
              className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                isDarkMode ? 'border-[#232B45] hover:bg-[#151B30] text-[#9FACC9]' : 'border-gray-200 hover:bg-gray-100 text-gray-600'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="1.5" /></svg>
            </button>
            <button
              onClick={handlePlayPause}
              disabled={!rows.length}
              title={playState === 'playing' ? '일시정지' : '재생'}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                isDarkMode ? 'bg-[#22D3EE] hover:bg-[#3FDCF0] text-[#0A0E1A]' : 'bg-green-700 hover:bg-green-800 text-white'
              }`}
            >
              {playState === 'playing' ? (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" /><rect x="14" y="5" width="4" height="14" /></svg>
              ) : (
                <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
              )}
            </button>

            <Dropdown
              value={speed}
              onChange={setSpeed}
              options={SPEED_OPTIONS.map(s => ({ value: s, label: `${s}x` }))}
              isDarkMode={isDarkMode}
              widthClass="w-[64px]"
            />

            <div className="relative flex-1 min-w-[120px]">
              <input
                type="range"
                min={0}
                max={durationMs || 0}
                value={Math.min(elapsedMs, durationMs || 0)}
                onChange={handleSeek}
                disabled={!rows.length}
                style={{
                  '--seek-accent': isDarkMode ? '#22D3EE' : '#15803d',
                  background: `linear-gradient(to right, ${isDarkMode ? '#22D3EE' : '#15803d'} 0%, ${isDarkMode ? '#22D3EE' : '#15803d'} ${seekFillPct}%, ${isDarkMode ? '#232B45' : '#E5E7EB'} ${seekFillPct}%, ${isDarkMode ? '#232B45' : '#E5E7EB'} 100%)`,
                }}
                className="sim-seekbar w-full disabled:opacity-40"
              />
            </div>

            <span className={`text-xs font-mono shrink-0 ${isDarkMode ? 'text-[#9FACC9]' : 'text-gray-500'}`}>
              {formatMmSs(elapsedMs)} / {formatMmSs(durationMs)}
            </span>

            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={handleUndo}
                disabled={undoStack.length === 0}
                title="마지막으로 수정한 셀 값을 되돌립니다"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                  isDarkMode ? 'border-[#232B45] hover:border-[#2A335A] hover:bg-[#151B30] text-[#9FACC9] hover:text-[#EDF1FC]' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-100 text-gray-600 hover:text-gray-900'
                }`}
              >
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 15L4 10m0 0l5-5m-5 5h11a4 4 0 010 8h-1" />
                </svg>
                되돌리기
              </button>
              <button
                onClick={() => askConfirm('저장하시겠습니까?', handleSaveScenario)}
                disabled={!selectedScenario}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                  Object.keys(editedValues).length > 0
                    ? (isDarkMode ? 'border-[#22D3EE] bg-[#22D3EE] text-[#0A0E1A] hover:bg-[#3FDCF0]' : 'border-green-700 bg-green-700 text-white hover:bg-green-800')
                    : (isDarkMode ? 'border-[#232B45] hover:border-[#2A335A] hover:bg-[#151B30] text-[#9FACC9] hover:text-[#EDF1FC]' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-100 text-gray-600 hover:text-gray-900')
                }`}
              >
                저장
              </button>
              <button
                onClick={handleExportScenario}
                disabled={!selectedScenario || isExportingFile}
                // disabled:cursor-not-allowed 클래스가 내보내기 중(disabled=true) 커서를 덮어써서
                // wait 커서가 안 보였음 - 인라인 style은 클래스보다 항상 우선 적용되므로 이걸로 강제함
                style={isExportingFile ? { cursor: 'wait' } : undefined}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                  isDarkMode ? 'border-[#232B45] hover:border-[#2A335A] hover:bg-[#151B30] text-[#9FACC9] hover:text-[#EDF1FC]' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-100 text-gray-600 hover:text-gray-900'
                }`}
              >
                내보내기
              </button>
            </div>
          </div>
        </div>

        {/* 메인 영역 */}
        <div className="flex-1 flex flex-col lg:flex-row gap-4 min-h-0 items-stretch lg:overflow-hidden">
          {/* 좌측: 등록된 시뮬레이션 목록 */}
          <div className={`w-full lg:w-[220px] shrink-0 rounded-xl border p-3 flex flex-col gap-2 lg:overflow-y-auto transition-colors ${
            isDarkMode ? 'bg-[#12172A] border-[#1E253D]' : 'bg-white border-gray-200 shadow-sm'
          }`}>
            <h3 className={`text-xs font-bold px-1 mb-1 ${isDarkMode ? 'text-[#7D87A8]' : 'text-gray-500'}`}>시뮬레이션 목록</h3>

            {isLoadingScenarios ? (
              <div className="py-6">
                <LoadingSpinner size="md" isDarkMode={isDarkMode} />
              </div>
            ) : scenarios.length === 0 ? (
              <p className={`text-xs px-1 ${isDarkMode ? 'text-[#7D87A8]' : 'text-gray-400'}`}>
                업로드 탭에서 엑셀 파일을 등록해 주세요.
              </p>
            ) : (
              scenarios.map(s => (
                <div
                  key={s.id}
                  onClick={() => handleSelectScenario(s)}
                  className={`group relative rounded-lg border p-2.5 cursor-pointer transition-colors ${
                    selectedScenarioId === s.id
                      ? (isDarkMode ? 'bg-[#151B30] border-[#22D3EE]/50' : 'bg-green-50 border-green-300')
                      : (isDarkMode ? 'bg-[#0D1224] border-[#232B45] hover:border-[#2A335A]' : 'bg-gray-50 border-gray-200 hover:border-gray-300')
                  }`}
                >
                  {s.id === selectedScenarioId && Object.keys(editedValues).length > 0 && (
                    <span
                      title="저장하지 않은 수정 사항이 있습니다"
                      className={`absolute -top-1 -left-1 text-sm font-bold leading-none ${isDarkMode ? 'text-[#22D3EE]' : 'text-green-700'}`}
                    >
                      *
                    </span>
                  )}
                  <p className={`text-xs font-bold truncate pr-5 ${isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-800'}`}>
                    {s.fileName}
                  </p>
                  <p className={`text-[10px] font-mono mt-0.5 flex items-center ${isDarkMode ? 'text-[#7D87A8]' : 'text-gray-400'}`}>
                    <span className="truncate">{formatKoreanDateTime(s.uploadedAt)}</span>
                    {s.menu && (
                      <span className={`shrink-0 ml-auto font-sans text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                        s.menu === 'all'
                          ? (isDarkMode ? 'bg-[#A78BFA]/15 text-[#A78BFA]' : 'bg-purple-100 text-purple-700')
                          : s.menu === 'temp'
                            ? (isDarkMode ? 'bg-[#FB5D75]/15 text-[#FB5D75]' : 'bg-red-100 text-red-700')
                            : (isDarkMode ? 'bg-[#22D3EE]/15 text-[#22D3EE]' : 'bg-cyan-100 text-cyan-700')
                      }`}>
                        {s.menu === 'all' ? '온도+전력' : s.menu === 'temp' ? '온도' : '전력'}
                      </span>
                    )}
                  </p>
                  <button
                    onClick={(e) => handleDeleteScenario(e, s.id)}
                    title="삭제"
                    className={`absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity ${
                      isDarkMode ? 'bg-[#1A2036] hover:bg-[#2A335A] text-[#9FACC9] hover:text-[#EDF1FC]' : 'bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>

          {/* 중앙: 시트 그리드 (엑셀 파일을 드래그하면 어디에 놓든 바로 업로드됨) */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragOver(false);
              handleFilesUpload(e.dataTransfer.files);
            }}
            className={`relative lg:flex-1 min-w-0 rounded-xl p-3.5 sm:p-5 flex flex-col border transition-colors h-[450px] lg:h-auto lg:min-h-0 overflow-hidden ${
              isExportingFile || isSavingScenario ? 'cursor-wait' : ''
            } ${
              isDarkMode ? 'bg-[#12172A] border-[#1E253D]' : 'bg-white border-gray-200 shadow-sm'
            }`}
          >
            {isDragOver && (
              <div className={`absolute inset-2 z-20 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 pointer-events-none ${
                isDarkMode ? 'border-[#22D3EE] bg-[#0A0E1A]/90' : 'border-green-500 bg-green-50/90'
              }`}>
                <svg className={`w-10 h-10 ${isDarkMode ? 'text-[#22D3EE]' : 'text-green-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 7.5m0 0L7.5 12m4.5-4.5v13.5" />
                </svg>
                <p className={`text-sm font-bold ${isDarkMode ? 'text-[#22D3EE]' : 'text-green-700'}`}>여기에 놓으면 업로드됩니다</p>
              </div>
            )}
            {isViewEquipPending && (
              <div className={`absolute inset-0 z-20 flex items-center justify-center ${isDarkMode ? 'bg-[#12172A]/80' : 'bg-white/80'}`}>
                <LoadingSpinner size="md" isDarkMode={isDarkMode} />
              </div>
            )}
            {isSavingScenario && (
              <div className={`absolute inset-0 z-30 flex items-center justify-center ${isDarkMode ? 'bg-[#12172A]/80' : 'bg-white/80'}`}>
                <LoadingSpinner size="md" isDarkMode={isDarkMode} label="저장하는 중..." />
              </div>
            )}
            {isExportingFile && (
              <div className={`absolute inset-0 z-30 flex items-center justify-center ${isDarkMode ? 'bg-[#12172A]/80' : 'bg-white/80'}`}>
                <LoadingSpinner size="md" isDarkMode={isDarkMode} label="CSV 파일을 만드는 중..." />
              </div>
            )}
            {isUploadingFile ? (
              <div className="flex-1 flex items-center justify-center">
                <LoadingSpinner size="lg" isDarkMode={isDarkMode} label="엑셀 파일을 불러오는 중..." />
              </div>
            ) : !selectedScenario ? (
              <div className={`flex-1 flex flex-col items-center justify-center gap-2 text-sm text-center ${isDarkMode ? 'text-[#7D87A8]' : 'text-gray-400'}`}>
                <svg className={`w-10 h-10 mb-1 ${isDarkMode ? 'text-[#232B45]' : 'text-gray-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 7.5m0 0L7.5 12m4.5-4.5v13.5" />
                </svg>
                왼쪽에서 시뮬레이션을 선택하거나,<br />엑셀 파일을 이 위에 드래그하거나 "엑셀 업로드" 버튼을 눌러 업로드하세요.
              </div>
            ) : isLoadingDetail ? (
              <div className="flex-1 flex items-center justify-center">
                <LoadingSpinner size="lg" isDarkMode={isDarkMode} label="시나리오를 불러오는 중..." />
              </div>
            ) : (
              <>
              {displayViewEquipId ? (
                <>
                {/* 실시간 추이 그래프 (드롭다운에서 설비를 선택했을 때만 표시) */}
                <div className={`shrink-0 mb-3 pb-3 border-b ${isDarkMode ? 'border-[#1E253D]' : 'border-gray-200'}`}>
                  <SimulationTrendChart
                    data={selectedEquipSeries}
                    equipName={selectedEquipName}
                    isDarkMode={isDarkMode}
                    onPointClick={setElapsedMs}
                    showTemperature={hasTemperatureData}
                    showPower={hasPowerData}
                  />
                </div>

                {/* 설비별 전체 시간 이력 보기 (읽기 전용) */}
                <div
                  ref={historyScrollRef}
                  onScroll={handleHistoryScroll}
                  className="relative flex-1 overflow-x-auto overflow-y-auto min-h-0 custom-scrollbar"
                >
                  <table className="w-full text-center border-collapse table-fixed min-w-[600px]">
                    <thead className={`sticky top-0 text-[11px] z-10 transition-colors ${
                      isDarkMode ? 'bg-[#0D1224] text-[#7D87A8]' : 'bg-gray-50 text-gray-500'
                    }`}>
                      <tr className="h-[40px]">
                        <th className={`${hasTemperatureData && hasPowerData ? 'w-[22%]' : 'w-[28%]'} grid-th`}>수신 시간</th>
                        {hasTemperatureData && (
                          <th className={`${hasPowerData ? 'w-[13%]' : 'w-[22%]'} grid-th`}>온도(℃)</th>
                        )}
                        {hasPowerData && (
                          <th className={`${hasTemperatureData ? 'w-[13%]' : 'w-[22%]'} grid-th`}>전력</th>
                        )}
                        {hasTemperatureData && (
                          <th className={`${hasPowerData ? 'w-[13%]' : 'w-[25%]'} grid-th`}>임계값(온도)</th>
                        )}
                        {hasPowerData && (
                          <th className={`${hasTemperatureData ? 'w-[13%]' : 'w-[25%]'} grid-th`}>임계값(전력)</th>
                        )}
                        {hasTemperatureData && (
                          <th className={`${hasPowerData ? 'w-[13%]' : 'w-[25%]'} grid-th`}>{hasPowerData ? '상태(온도)' : '상태'}</th>
                        )}
                        {hasPowerData && (
                          <th className={`${hasTemperatureData ? 'w-[13%]' : 'w-[25%]'} grid-th`}>{hasTemperatureData ? '상태(전력)' : '상태'}</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className={`divide-y text-xs sm:text-[13px] ${isDarkMode ? 'divide-[#2A335A] text-[#B9C2DE]' : 'divide-gray-300 text-gray-600'}`}>
                      {equipHistoryRows.length === 0 ? (
                        <tr>
                          <td colSpan={historyColCount} className={`px-3.5 py-10 text-center ${isDarkMode ? 'text-[#7D87A8]' : 'text-gray-400'}`}>
                            이 설비의 데이터가 없습니다.
                          </td>
                        </tr>
                      ) : (
                        <>
                        {historyTopSpacerHeight > 0 && (
                          <tr style={{ height: historyTopSpacerHeight }} aria-hidden="true"><td colSpan={historyColCount} /></tr>
                        )}
                        {visibleHistoryRows.map((r, i) => {
                          const idx = historyStartIdx + i;
                          const tempStatusMeta = getStatusMeta(r.status);
                          const tempStatusStyle = STATUS_STYLES[tempStatusMeta.color][isDarkMode ? 'dark' : 'light'];
                          const powerStatusMeta = getStatusMeta(r.powerStatus);
                          const powerStatusStyle = STATUS_STYLES[powerStatusMeta.color][isDarkMode ? 'dark' : 'light'];
                          // 행 배경 강조는 온도/전력 중 더 심각한 쪽 기준 (있는 지표만 비교)
                          const worstMeta = [hasTemperatureData && tempStatusMeta, hasPowerData && powerStatusMeta]
                            .filter(Boolean)
                            .reduce((worst, m) => (STATUS_SORT_ORDER[m.label] > STATUS_SORT_ORDER[worst.label] ? m : worst), { label: '정상', color: 'green' });
                          const isDanger = worstMeta.color === 'red';
                          const isWarning = worstMeta.color === 'amber';
                          const isCurrentPlayheadRow = idx === currentViewRowIdx;
                          return (
                            <tr
                              key={`${r.equipId}-${r.time.getTime()}-${idx}`}
                              className={`h-[44px] max-h-[44px] transition-colors ${
                                isCurrentPlayheadRow ? `border-2 ${isDarkMode ? 'border-[#22D3EE]' : 'border-green-600'}` : ''
                              } ${
                                isDanger
                                  ? (isDarkMode ? 'bg-[#FB5D75]/15' : 'bg-red-50')
                                  : isWarning
                                    ? (isDarkMode ? 'bg-[#FBBF24]/10' : 'bg-amber-50')
                                    : ''
                              }`}
                            >
                              <td className={`px-3 py-0 h-[44px] font-mono text-[13px] truncate align-middle ${isDarkMode ? 'text-[#7D87A8]' : 'text-gray-500'}`}>
                                {formatKoreanDateTime(r.time)}
                              </td>
                              {hasTemperatureData && (
                                <td className={`px-3 py-0 h-[44px] align-middle`}>
                                  <EditableCell
                                    key={`hist-temp-${r.equipId}-${r.time.getTime()}`}
                                    initialValue={r.temperature}
                                    onChangeValue={(v) => handleCellValueEdit(r, 'temperature', v)}
                                    className={`w-[64px] h-[28px] grid-cell-input ${
                                      isDarkMode ? 'bg-[#0D1224] border-[#2A335A] focus:border-[#22D3EE]' : 'bg-white border-gray-300 focus:border-green-600'
                                    } ${tempStatusMeta.color === 'green' ? (isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-800') : tempStatusStyle.text}`}
                                  />
                                </td>
                              )}
                              {hasPowerData && (
                                <td className={`px-3 py-0 h-[44px] align-middle`}>
                                  <EditableCell
                                    key={`hist-power-${r.equipId}-${r.time.getTime()}`}
                                    initialValue={r.power ?? ''}
                                    onChangeValue={(v) => handleCellValueEdit(r, 'power', v)}
                                    className={`w-[64px] h-[28px] grid-cell-input ${
                                      isDarkMode ? 'bg-[#0D1224] border-[#2A335A] focus:border-[#22D3EE]' : 'bg-white border-gray-300 focus:border-green-600'
                                    } ${powerStatusMeta.color === 'green' ? (isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-800') : powerStatusStyle.text}`}
                                  />
                                </td>
                              )}
                              {hasTemperatureData && (
                                <td className={`px-3 py-0 h-[44px] align-middle`}>
                                  <EditableCell
                                    key={`hist-threshold-${r.equipId}-${r.time.getTime()}`}
                                    initialValue={r.threshold ?? ''}
                                    onChangeValue={(v) => handleCellValueEdit(r, 'threshold', v)}
                                    className={`w-[64px] h-[28px] grid-cell-input ${
                                      isDarkMode ? 'bg-[#0D1224] border-[#2A335A] text-[#7D87A8] focus:border-[#22D3EE]' : 'bg-white border-gray-300 text-gray-500 focus:border-green-600'
                                    }`}
                                  />
                                </td>
                              )}
                              {hasPowerData && (
                                <td className={`px-3 py-0 h-[44px] align-middle`}>
                                  <EditableCell
                                    key={`hist-power-threshold-${r.equipId}-${r.time.getTime()}`}
                                    initialValue={r.powerThreshold ?? ''}
                                    onChangeValue={(v) => handleCellValueEdit(r, 'powerThreshold', v)}
                                    className={`w-[64px] h-[28px] grid-cell-input ${
                                      isDarkMode ? 'bg-[#0D1224] border-[#2A335A] text-[#7D87A8] focus:border-[#22D3EE]' : 'bg-white border-gray-300 text-gray-500 focus:border-green-600'
                                    }`}
                                  />
                                </td>
                              )}
                              {hasTemperatureData && (
                                <td className="px-3 py-0 h-[44px]">
                                  <div className={`status-badge ${tempStatusStyle.text}`}>
                                    <span className={`status-dot ${tempStatusStyle.dot}`} />
                                    {tempStatusMeta.label}
                                  </div>
                                </td>
                              )}
                              {hasPowerData && (
                                <td className="px-3 py-0 h-[44px]">
                                  <div className={`status-badge ${powerStatusStyle.text}`}>
                                    <span className={`status-dot ${powerStatusStyle.dot}`} />
                                    {powerStatusMeta.label}
                                  </div>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                        {historyBottomSpacerHeight > 0 && (
                          <tr style={{ height: historyBottomSpacerHeight }} aria-hidden="true"><td colSpan={historyColCount} /></tr>
                        )}
                        </>
                      )}
                    </tbody>
                  </table>
                </div>
                </>
              ) : (
              <div className="flex-1 overflow-x-auto overflow-y-auto min-h-0 custom-scrollbar">
                <table className="w-full text-center border-collapse table-fixed min-w-[900px]">
                  <thead className={`sticky top-0 text-[11px] z-10 transition-colors ${
                    isDarkMode ? 'bg-[#0D1224] text-[#7D87A8]' : 'bg-gray-50 text-gray-500'
                  }`}>
                    <tr className="h-[40px]">
                      {renderSortableHeader('equipId', 'ID', 'w-[9%]')}
                      {renderSortableHeader('equipName', '설비명', 'w-[15%]')}
                      {renderSortableHeader('location', '위치', 'w-[5%]')}
                      {renderSortableHeader('time', '수신 시간', 'w-[19%]')}
                      {hasTemperatureData && renderSortableHeader('temperature', '온도(℃)', hasPowerData ? 'w-[9%]' : 'w-[12%]')}
                      {hasPowerData && renderSortableHeader('power', '전력', hasTemperatureData ? 'w-[9%]' : 'w-[12%]')}
                      {hasTemperatureData && renderSortableHeader('threshold', '임계값(온도)', hasPowerData ? 'w-[9%]' : 'w-[10%]')}
                      {hasPowerData && renderSortableHeader('powerThreshold', '임계값(전력)', hasTemperatureData ? 'w-[9%]' : 'w-[10%]')}
                      {hasTemperatureData && renderSortableHeader('status', hasPowerData ? '상태(온도)' : '상태', hasPowerData ? 'w-[8%]' : 'w-[11%]')}
                      {hasPowerData && renderSortableHeader('powerStatus', hasTemperatureData ? '상태(전력)' : '상태', hasTemperatureData ? 'w-[8%]' : 'w-[11%]')}
                      <th className={`w-[16%] grid-th`}>전체 흐름</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y text-xs sm:text-[13px] ${isDarkMode ? 'divide-[#2A335A] text-[#B9C2DE]' : 'divide-gray-300 text-gray-600'}`}>
                    {currentEquipRows.length === 0 ? (
                      <tr>
                        <td colSpan={10} className={`px-3.5 py-10 text-center ${isDarkMode ? 'text-[#7D87A8]' : 'text-gray-400'}`}>
                          재생을 시작하면 데이터가 표시됩니다.
                        </td>
                      </tr>
                    ) : (
                      currentEquipRows.map(eq => {
                        const playheadPct = durationMs > 0 ? (elapsedMs / durationMs) * 100 : null;
                        const tempStatusMeta = getStatusMeta(eq.status);
                        const tempStatusStyle = STATUS_STYLES[tempStatusMeta.color][isDarkMode ? 'dark' : 'light'];
                        const powerStatusMeta = getStatusMeta(eq.powerStatus);
                        const powerStatusStyle = STATUS_STYLES[powerStatusMeta.color][isDarkMode ? 'dark' : 'light'];
                        // 행 배경 강조는 온도/전력 중 더 심각한 쪽 기준 (있는 지표만 비교)
                        const worstMeta = [hasTemperatureData && tempStatusMeta, hasPowerData && powerStatusMeta]
                          .filter(Boolean)
                          .reduce((worst, m) => (STATUS_SORT_ORDER[m.label] > STATUS_SORT_ORDER[worst.label] ? m : worst), { label: '정상', color: 'green' });
                        const isSelected = selectedEquipId === eq.equipId;
                        const isDanger = worstMeta.color === 'red';
                        const isWarning = worstMeta.color === 'amber';
                        const isClickHighlighted = clickHighlightId === eq.equipId;
                        return (
                          <tr
                            key={eq.equipId}
                            id={`equip-row-${eq.equipId}`}
                            onClick={() => setSelectedEquipId(isSelected ? null : eq.equipId)}
                            className={`h-[52px] max-h-[52px] cursor-pointer transition-colors duration-300 border-l-2 ${
                              isClickHighlighted
                                ? (isDarkMode ? 'bg-amber-400/15 border-l-amber-400' : 'bg-amber-100 border-l-amber-500')
                                : isSelected
                                  ? (isDarkMode ? 'bg-[#151B30] border-l-[#22D3EE]' : 'bg-green-50/70 border-l-green-600')
                                  : isDanger
                                    ? (isDarkMode ? 'bg-[#FB5D75]/15 hover:bg-[#FB5D75]/20 border-l-[#FB5D75]' : 'bg-red-50 hover:bg-red-100 border-l-red-500')
                                    : isWarning
                                      ? (isDarkMode ? 'bg-[#FBBF24]/10 hover:bg-[#FBBF24]/15 border-l-amber-400' : 'bg-amber-50 hover:bg-amber-100 border-l-amber-500')
                                      : (isDarkMode ? 'hover:bg-[#0F1526] border-l-transparent' : 'hover:bg-gray-50 border-l-transparent')
                            }`}
                          >
                            <td className={`px-3 py-0 h-[52px] font-mono truncate align-middle ${isDarkMode ? 'text-[#7D87A8]' : 'text-gray-400'}`}>
                              #{eq.equipId}
                            </td>
                            <td className={`px-3 py-0 h-[52px] font-bold truncate align-middle ${isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-800'}`}>
                              {eq.equipName}
                            </td>
                            <td className={`px-3 py-0 h-[52px] text-[11px] truncate align-middle ${isDarkMode ? 'text-[#9FACC9]' : 'text-gray-600'}`}>
                              {eq.location || '-'}
                            </td>
                            <td className={`px-3 py-0 h-[52px] font-mono text-[13px] whitespace-nowrap align-middle ${isDarkMode ? 'text-[#7D87A8]' : 'text-gray-500'}`}>
                              {formatKoreanDateTime(eq.time)}
                            </td>
                            {hasTemperatureData && (
                              <td className={`px-3 py-0 h-[52px] align-middle`}>
                                <EditableCell
                                  key={`temp-${eq.equipId}-${eq.time.getTime()}`}
                                  initialValue={eq.temperature}
                                  onChangeValue={(v) => handleCellValueEdit(eq, 'temperature', v)}
                                  className={`w-[70px] h-[30px] grid-cell-input ${
                                    isDarkMode ? 'bg-[#0D1224] border-[#2A335A] focus:border-[#22D3EE]' : 'bg-white border-gray-300 focus:border-green-600'
                                  } ${tempStatusMeta.color === 'green' ? (isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-800') : tempStatusStyle.text}`}
                                />
                              </td>
                            )}
                            {hasPowerData && (
                              <td className={`px-3 py-0 h-[52px] align-middle`}>
                                <EditableCell
                                  key={`power-${eq.equipId}-${eq.time.getTime()}`}
                                  initialValue={eq.power ?? ''}
                                  onChangeValue={(v) => handleCellValueEdit(eq, 'power', v)}
                                  className={`w-[70px] h-[30px] grid-cell-input ${
                                    isDarkMode ? 'bg-[#0D1224] border-[#2A335A] focus:border-[#22D3EE]' : 'bg-white border-gray-300 focus:border-green-600'
                                  } ${powerStatusMeta.color === 'green' ? (isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-800') : powerStatusStyle.text}`}
                                />
                              </td>
                            )}
                            {hasTemperatureData && (
                              <td className={`px-3 py-0 h-[52px] align-middle`}>
                                <EditableCell
                                  key={`threshold-${eq.equipId}-${eq.time.getTime()}`}
                                  initialValue={eq.threshold ?? ''}
                                  onChangeValue={(v) => handleCellValueEdit(eq, 'threshold', v)}
                                  className={`w-[70px] h-[30px] grid-cell-input ${
                                    isDarkMode ? 'bg-[#0D1224] border-[#2A335A] text-[#7D87A8] focus:border-[#22D3EE]' : 'bg-white border-gray-300 text-gray-500 focus:border-green-600'
                                  }`}
                                />
                              </td>
                            )}
                            {hasPowerData && (
                              <td className={`px-3 py-0 h-[52px] align-middle`}>
                                <EditableCell
                                  key={`power-threshold-${eq.equipId}-${eq.time.getTime()}`}
                                  initialValue={eq.powerThreshold ?? ''}
                                  onChangeValue={(v) => handleCellValueEdit(eq, 'powerThreshold', v)}
                                  className={`w-[70px] h-[30px] grid-cell-input ${
                                    isDarkMode ? 'bg-[#0D1224] border-[#2A335A] text-[#7D87A8] focus:border-[#22D3EE]' : 'bg-white border-gray-300 text-gray-500 focus:border-green-600'
                                  }`}
                                />
                              </td>
                            )}
                            {hasTemperatureData && (
                              <td className={`px-3 py-0 h-[52px]`}>
                                <div className={`status-badge ${tempStatusStyle.text}`}>
                                  <span className={`status-dot ${tempStatusStyle.dot}`} />
                                  {tempStatusMeta.label}
                                </div>
                              </td>
                            )}
                            {hasPowerData && (
                              <td className={`px-3 py-0 h-[52px]`}>
                                <div className={`status-badge ${powerStatusStyle.text}`}>
                                  <span className={`status-dot ${powerStatusStyle.dot}`} />
                                  {powerStatusMeta.label}
                                </div>
                              </td>
                            )}
                            <td className="px-3 py-0 h-[52px] align-middle">
                              <div className="flex flex-col gap-1 justify-center">
                                {hasTemperatureData && (
                                  <div className="flex items-center gap-1">
                                    {hasPowerData && <span className={`text-[8px] font-semibold shrink-0 w-4 ${isDarkMode ? 'text-[#5C6584]' : 'text-gray-400'}`}>온도</span>}
                                    <EquipTimelineBar segments={equipTimelines[eq.equipId]?.temperature} playheadPct={playheadPct} isDarkMode={isDarkMode} />
                                  </div>
                                )}
                                {hasPowerData && (
                                  <div className="flex items-center gap-1">
                                    {hasTemperatureData && <span className={`text-[8px] font-semibold shrink-0 w-4 ${isDarkMode ? 'text-[#5C6584]' : 'text-gray-400'}`}>전력</span>}
                                    <EquipTimelineBar segments={equipTimelines[eq.equipId]?.power} playheadPct={playheadPct} isDarkMode={isDarkMode} />
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              )}
              </>
            )}
          </div>

          {/* 우측: 알람 사이드바 */}
          <div className="w-full lg:w-[300px] xl:w-[330px] shrink-0">
            <AlarmSidebar
              alarms={displayedAlarms}
              onClear={handleClearAlarms}
              onDismiss={handleDismissAlarm}
              onAlarmClick={handleAlarmClick}
              openLogs={() => setIsLogOpen(true)}
              selectedEquipName={selectedEquipName}
              onClearFilter={() => setSelectedEquipId(null)}
              statusCounts={statusCounts}
              isDarkMode={isDarkMode}
              showTemperatureTab={hasTemperatureData}
              showPowerTab={hasPowerData}
            />
          </div>
        </div>
      </div>

      {isLogOpen && (
        <FullLogModal
          logs={simLogs}
          onClear={(metric) => {
            if (metric === 'all') setSimLogs([]);
            else setSimLogs(prev => prev.filter(l => (l.metric || 'temperature') !== metric));
          }}
          onClose={() => setIsLogOpen(false)}
          isDarkMode={isDarkMode}
          showTemperatureTab={hasTemperatureData}
          showPowerTab={hasPowerData}
        />
      )}

      <CustomAlert message={alertMessage} onClose={() => setAlertMessage('')} isDarkMode={isDarkMode} />
      <CustomConfirm message={confirmMessage} onConfirm={handleConfirmYes} onCancel={handleConfirmNo} isDarkMode={isDarkMode} />
    </div>
  );
};

export default SimulationScreen;
