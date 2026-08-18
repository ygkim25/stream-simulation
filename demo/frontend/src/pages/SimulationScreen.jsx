import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
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
import { parseSimulationFile, computeStatus, computeCombinedStatus, isWarningStatus, formatMmSs, formatClockTime } from '../utils/simulationParse';
import { STATUS_STYLES, getStatusMeta } from '../utils/statusStyles';
import { useClickOutside } from '../utils/useClickOutside';
import { compareByEquipId, STATUS_SORT_ORDER } from '../utils/sortHelpers';
import { formatKoreanDateTime } from '../utils/dateFormat';

const SPEED_OPTIONS = [1, 2, 4, 8];

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
const SimulationScreen = ({ user, setRoute, openMyPage, isDarkMode, setIsDarkMode }) => {
  const [scenarios, setScenarios] = useState([]);
  const [isLoadingScenarios, setIsLoadingScenarios] = useState(true); // 시나리오 목록 최초 조회 중
  const [isLoadingDetail, setIsLoadingDetail] = useState(false); // 선택한 시나리오 상세(로우) 조회 중
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
  const currentViewRowRef = useRef(null);

  // 수정 후 저장된 시나리오 id 목록 (백엔드에 컬럼이 없어 localStorage에만 기록, 기기별로 다름)
  const [editedScenarioIds, setEditedScenarioIds] = useState(() => {
    try {
      const saved = localStorage.getItem('simEditedScenarioIds');
      return new Set(saved ? JSON.parse(saved) : []);
    } catch {
      return new Set();
    }
  });
  const persistEditedScenarioIds = (set) => {
    try {
      localStorage.setItem('simEditedScenarioIds', JSON.stringify([...set]));
    } catch (e) {
      console.error('수정 표시 저장 실패:', e);
    }
  };

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

  const handleSelectScenario = async (scenario) => {
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
      setEditedScenarioIds(prev => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        persistEditedScenarioIds(next);
        return next;
      });
      await loadScenarios();
    });
  };

  // 재생 구간의 전체 길이(ms) 및 시작 시각
  const startTimeMs = rows.length ? rows[0].time.getTime() : 0;
  const durationMs = rows.length ? rows[rows.length - 1].time.getTime() - startTimeMs : 0;

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
              elapsedMs: r.time.getTime() - startTimeMs,
              kind: 'warning',
              metric,
              value: r[valueKey],
              threshold: r[thresholdKey],
            });
          } else if (prevStatus && isWarningStatus(prevStatus)) {
            events.push({
              id: `log-${metric}-${r.equipId}-${r.time.getTime()}`,
              equipId: r.equipId,
              equipName: r.equipName,
              elapsedMs: r.time.getTime() - startTimeMs,
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
    message: e.kind === 'warning' ? '임계값 초과 감지' : '정상 범위로 복구됨',
    value: e.value,
    threshold: e.threshold,
  });

  // 재생 위치(elapsedMs)가 바뀔 때마다 지금까지 발생한 전환 이벤트를 알람/로그에 반영
  useEffect(() => {
    if (!rows.length) return;
    const prev = prevElapsedRef.current;
    if (elapsedMs < prev) {
      // 되감기(스크럽): 처음부터 현재 위치까지 다시 계산
      const upto = transitionEvents.filter(e => e.elapsedMs <= elapsedMs);
      setSimAlarms(upto.filter(e => e.kind === 'warning').map(toAlarmCard));
      setSimLogs(upto.map(toLogCard));
    } else if (elapsedMs > prev) {
      const newly = transitionEvents.filter(e => e.elapsedMs > prev && e.elapsedMs <= elapsedMs);
      if (newly.length > 0) {
        setSimAlarms(p => [...p, ...newly.filter(e => e.kind === 'warning').map(toAlarmCard)]);
        setSimLogs(p => [...p, ...newly.map(toLogCard)]);
      }
    }
    prevElapsedRef.current = elapsedMs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsedMs, transitionEvents]);

  // 재생 타이머
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

  const handleSeek = (e) => {
    setElapsedMs(Number(e.target.value));
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

  // 현재 재생 시점 기준, 설비별 가장 최근 값(수동 수정값 있으면 그 값으로 덮어씀)
  const currentEquipRows = useMemo(() => {
    if (!rows.length) return [];
    const cutoff = startTimeMs + elapsedMs;
    const latestByEquip = new Map();
    rows.forEach(r => {
      if (r.time.getTime() <= cutoff) {
        const existing = latestByEquip.get(r.equipId);
        if (!existing || r.time.getTime() > existing.time.getTime()) {
          latestByEquip.set(r.equipId, r);
        }
      }
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
  }, [rows, elapsedMs, editedValues, startTimeMs, sortColumn, sortDirection]);

  // 설비별 전체 상태 흐름을 온도/전력 각각 색 구간으로 미리 계산 (elapsedMs 무관, 한 번만)
  const equipTimelines = useMemo(() => {
    if (!rows.length || durationMs <= 0) return {};
    const byEquip = new Map();
    rows.forEach(r => {
      if (!byEquip.has(r.equipId)) byEquip.set(r.equipId, []);
      byEquip.get(r.equipId).push(r);
    });

    const scenarioEndMs = startTimeMs + durationMs;
    const buildSegments = (resolved) => {
      const segments = [];
      resolved.forEach((point, idx) => {
        // 첫 구간은 startTimeMs부터 채워서 막대 길이가 항상 100%로 보이게 함
        const segStart = idx === 0 ? startTimeMs : point.time;
        const segEnd = idx < resolved.length - 1 ? resolved[idx + 1].time : scenarioEndMs;
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

  // 선택한 설비의 "지금까지" 추이 (재생 위치가 앞으로 갈수록 점이 이어져 그려짐)
  const selectedEquipSeries = useMemo(() => {
    if (!selectedEquipId || !rows.length) return [];
    const cutoff = startTimeMs + elapsedMs;
    let prevStatus = null;
    return rows
      .filter(r => r.equipId === selectedEquipId && r.time.getTime() <= cutoff)
      .sort((a, b) => a.time.getTime() - b.time.getTime())
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
          elapsedMs: rowTime - startTimeMs,
          temperature: editedTemp !== undefined ? editedTemp : r.temperature,
          power: editedPower !== undefined ? editedPower : r.power,
          threshold: editedThreshold !== undefined ? editedThreshold : r.threshold,
          powerThreshold: editedPowerThreshold !== undefined ? editedPowerThreshold : r.powerThreshold,
          isWarning,
        };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, selectedEquipId, elapsedMs, editedValues, startTimeMs]);

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
      const now = new Date();
      const timeLabel = formatClockTime(now);
      const cardId = `manual-${metric}-${equipId}-${now.getTime()}`;
      setSimAlarms(p => [...p, {
        id: cardId,
        equipId,
        equipName: row.equipName,
        time: timeLabel,
        value: alarmValue,
        threshold: alarmThreshold,
        location: row.location || '-',
        metric,
      }]);
      setSimLogs(p => [...p, {
        id: `log-${cardId}`,
        time: timeLabel,
        type: 'warning',
        equipName: row.equipName,
        message: `임계값 초과 감지 (${newStatus}) [수동 수정]`,
        value: alarmValue,
        threshold: alarmThreshold,
      }]);
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
    let lastSaved = null;
    let lastParsedRows = null;
    const failedNames = [];
    for (const file of files) {
      try {
        const { rows: parsedRows, missingTimeCount } = await parseSimulationFile(file);
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

    try {
      await updateScenarioRows(selectedScenarioId, updatedRows, user?.token);
    } catch (err) {
      console.error('시나리오 저장 실패:', err);
      showAlert('시나리오를 저장하는 중 오류가 발생했습니다.');
      return;
    }
    setRows(updatedRows);
    setEditedValues({});
    setUndoStack([]);
    lastEditKeyRef.current = null;
    setEditedScenarioIds(prev => {
      const next = new Set(prev);
      next.add(selectedScenarioId);
      persistEditedScenarioIds(next);
      return next;
    });
    await loadScenarios();
    // 백엔드가 아직 저장 시각을 안 갱신해줘서, 목록 재정렬(맨 위로)/날짜 표시는 일단 프론트에서만 임의로 반영
    // (새로고침하면 서버의 원래 업로드 시각으로 되돌아감 - 백엔드에서 uploadedAt 갱신을 지원하면 제거)
    const now = new Date().toISOString();
    setScenarios(prev => [...prev]
      .map(s => (s.id === selectedScenarioId ? { ...s, uploadedAt: now } : s))
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()));
    showAlert('저장되었습니다.');
  };

  // 현재 화면에 보이는 데이터(수정 중인 값 포함)를 엑셀 파일로 내보내기 (저장 여부와 무관)
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

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    worksheet['!cols'] = [
      { wch: 8 }, { wch: 15 }, { wch: 12 }, { wch: 25 }, { wch: 10 }, { wch: 10 }, { wch: 15 }, { wch: 15 }, { wch: 10 }
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '시뮬레이션');

    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = today.toTimeString().slice(0, 5).replace(':', '');
    const baseName = selectedScenario.fileName.replace(/\.(xlsx|xls)$/i, '');
    XLSX.writeFile(workbook, `${baseName}_수정_${dateStr}_${timeStr}.xlsx`);
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

  // 드롭다운에 표시할 시나리오 내 설비 목록 (중복 제거, ID 오름차순)
  const equipOptions = useMemo(() => {
    const map = new Map();
    rows.forEach(r => { if (!map.has(r.equipId)) map.set(r.equipId, r.equipName); });
    return [...map.entries()]
      .map(([equipId, equipName]) => ({ equipId, equipName }))
      .sort((a, b) => String(a.equipId).localeCompare(String(b.equipId)));
  }, [rows]);

  // 드롭다운에서 고른 설비의 전체 시간별 이력 (시간순, 읽기 전용)
  const equipHistoryRows = useMemo(() => {
    if (!viewEquipId) return [];
    return rows
      .filter(r => r.equipId === viewEquipId)
      .sort((a, b) => a.time.getTime() - b.time.getTime())
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
  }, [rows, viewEquipId, editedValues]);

  // 설비별 이력 표에서, 지금 재생 위치에 해당하는 행(전체보기에 표시되는 것과 같은 행)을 테두리로 표시
  const currentViewEquipTime = currentEquipRows.find(r => r.equipId === viewEquipId)?.time?.getTime();

  // 재생 위치가 바뀌어 테두리로 표시되는 행이 이동하면, 그 행이 보이도록 표를 자동으로 스크롤
  useEffect(() => {
    if (currentViewRowRef.current) {
      currentViewRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentViewEquipTime, viewEquipId]);

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
        title="시뮬레이션 모드"
        user={user}
        setRoute={setRoute}
        openMyPage={openMyPage}
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
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
                  ? `${formatKoreanDateTime(startTimeMs)} ~ ${formatKoreanDateTime(startTimeMs + durationMs)}`
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
                onClick={handleSaveScenario}
                disabled={!selectedScenario}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                  isDarkMode ? 'border-[#232B45] hover:border-[#2A335A] hover:bg-[#151B30] text-[#9FACC9] hover:text-[#EDF1FC]' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-100 text-gray-600 hover:text-gray-900'
                }`}
              >
                저장
              </button>
              <button
                onClick={handleExportScenario}
                disabled={!selectedScenario}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
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
                  <p className={`text-xs font-bold truncate pr-5 ${isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-800'}`}>
                    {s.fileName}
                  </p>
                  <p className={`text-[10px] font-mono mt-0.5 flex items-center ${isDarkMode ? 'text-[#7D87A8]' : 'text-gray-400'}`}>
                    <span className="truncate">{formatKoreanDateTime(s.uploadedAt)}</span>
                    {editedScenarioIds.has(s.id) && (
                      <span
                        title="수정 후 저장된 시나리오입니다"
                        className={`shrink-0 ml-auto font-sans text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                          isDarkMode ? 'bg-[#22D3EE]/15 text-[#22D3EE]' : 'bg-green-100 text-green-700'
                        }`}
                      >
                        수정됨
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
            {!selectedScenario ? (
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
              {viewEquipId ? (
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
                <div className="flex-1 overflow-x-auto overflow-y-auto min-h-0 custom-scrollbar">
                  <table className="w-full text-center border-collapse table-fixed min-w-[600px]">
                    <thead className={`sticky top-0 text-[11px] z-10 transition-colors ${
                      isDarkMode ? 'bg-[#0D1224] text-[#7D87A8]' : 'bg-gray-50 text-gray-500'
                    }`}>
                      <tr className="h-[40px]">
                        <th className={`${hasTemperatureData && hasPowerData ? 'w-[22%]' : 'w-[28%]'} px-3 border-b font-semibold uppercase ${isDarkMode ? 'border-[#2A335A]' : 'border-gray-300'}`}>수신 시간</th>
                        {hasTemperatureData && (
                          <th className={`${hasPowerData ? 'w-[13%]' : 'w-[22%]'} px-3 border-b font-semibold uppercase ${isDarkMode ? 'border-[#2A335A]' : 'border-gray-300'}`}>온도(℃)</th>
                        )}
                        {hasPowerData && (
                          <th className={`${hasTemperatureData ? 'w-[13%]' : 'w-[22%]'} px-3 border-b font-semibold uppercase ${isDarkMode ? 'border-[#2A335A]' : 'border-gray-300'}`}>전력</th>
                        )}
                        {hasTemperatureData && (
                          <th className={`${hasPowerData ? 'w-[13%]' : 'w-[25%]'} px-3 border-b font-semibold uppercase ${isDarkMode ? 'border-[#2A335A]' : 'border-gray-300'}`}>임계값(온도)</th>
                        )}
                        {hasPowerData && (
                          <th className={`${hasTemperatureData ? 'w-[13%]' : 'w-[25%]'} px-3 border-b font-semibold uppercase ${isDarkMode ? 'border-[#2A335A]' : 'border-gray-300'}`}>임계값(전력)</th>
                        )}
                        {hasTemperatureData && (
                          <th className={`${hasPowerData ? 'w-[13%]' : 'w-[25%]'} px-3 border-b font-semibold uppercase ${isDarkMode ? 'border-[#2A335A]' : 'border-gray-300'}`}>{hasPowerData ? '상태(온도)' : '상태'}</th>
                        )}
                        {hasPowerData && (
                          <th className={`${hasTemperatureData ? 'w-[13%]' : 'w-[25%]'} px-3 border-b font-semibold uppercase ${isDarkMode ? 'border-[#2A335A]' : 'border-gray-300'}`}>{hasTemperatureData ? '상태(전력)' : '상태'}</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className={`divide-y text-xs sm:text-[13px] ${isDarkMode ? 'divide-[#2A335A] text-[#B9C2DE]' : 'divide-gray-300 text-gray-600'}`}>
                      {equipHistoryRows.length === 0 ? (
                        <tr>
                          <td colSpan={1 + (hasTemperatureData ? 2 : 0) + (hasPowerData ? 2 : 0) + 1} className={`px-3.5 py-10 text-center ${isDarkMode ? 'text-[#7D87A8]' : 'text-gray-400'}`}>
                            이 설비의 데이터가 없습니다.
                          </td>
                        </tr>
                      ) : (
                        equipHistoryRows.map((r, idx) => {
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
                          const isCurrentPlayheadRow = r.time.getTime() === currentViewEquipTime;
                          return (
                            <tr
                              key={`${r.equipId}-${r.time.getTime()}-${idx}`}
                              ref={isCurrentPlayheadRow ? currentViewRowRef : undefined}
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
                                    className={`w-[64px] h-[28px] mx-auto block rounded px-1.5 text-center font-bold focus:outline-none border text-xs leading-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
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
                                    className={`w-[64px] h-[28px] mx-auto block rounded px-1.5 text-center font-bold focus:outline-none border text-xs leading-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
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
                                    className={`w-[64px] h-[28px] mx-auto block rounded px-1.5 text-center font-bold focus:outline-none border text-xs leading-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
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
                                    className={`w-[64px] h-[28px] mx-auto block rounded px-1.5 text-center font-bold focus:outline-none border text-xs leading-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                                      isDarkMode ? 'bg-[#0D1224] border-[#2A335A] text-[#7D87A8] focus:border-[#22D3EE]' : 'bg-white border-gray-300 text-gray-500 focus:border-green-600'
                                    }`}
                                  />
                                </td>
                              )}
                              {hasTemperatureData && (
                                <td className="px-3 py-0 h-[44px]">
                                  <div className={`h-full flex items-center justify-center gap-1 text-xs font-bold whitespace-nowrap ${tempStatusStyle.text}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${tempStatusStyle.dot}`} />
                                    {tempStatusMeta.label}
                                  </div>
                                </td>
                              )}
                              {hasPowerData && (
                                <td className="px-3 py-0 h-[44px]">
                                  <div className={`h-full flex items-center justify-center gap-1 text-xs font-bold whitespace-nowrap ${powerStatusStyle.text}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${powerStatusStyle.dot}`} />
                                    {powerStatusMeta.label}
                                  </div>
                                </td>
                              )}
                            </tr>
                          );
                        })
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
                      <th className={`w-[16%] px-3 border-b font-semibold uppercase ${isDarkMode ? 'border-[#2A335A]' : 'border-gray-300'}`}>전체 흐름</th>
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
                                  className={`w-[70px] h-[30px] mx-auto block rounded px-1.5 text-center font-bold focus:outline-none border text-xs leading-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
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
                                  className={`w-[70px] h-[30px] mx-auto block rounded px-1.5 text-center font-bold focus:outline-none border text-xs leading-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
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
                                  className={`w-[70px] h-[30px] mx-auto block rounded px-1.5 text-center font-bold focus:outline-none border text-xs leading-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
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
                                  className={`w-[70px] h-[30px] mx-auto block rounded px-1.5 text-center font-bold focus:outline-none border text-xs leading-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                                    isDarkMode ? 'bg-[#0D1224] border-[#2A335A] text-[#7D87A8] focus:border-[#22D3EE]' : 'bg-white border-gray-300 text-gray-500 focus:border-green-600'
                                  }`}
                                />
                              </td>
                            )}
                            {hasTemperatureData && (
                              <td className={`px-3 py-0 h-[52px]`}>
                                <div className={`h-full flex items-center justify-center gap-1 text-xs font-bold whitespace-nowrap ${tempStatusStyle.text}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${tempStatusStyle.dot}`} />
                                  {tempStatusMeta.label}
                                </div>
                              </td>
                            )}
                            {hasPowerData && (
                              <td className={`px-3 py-0 h-[52px]`}>
                                <div className={`h-full flex items-center justify-center gap-1 text-xs font-bold whitespace-nowrap ${powerStatusStyle.text}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${powerStatusStyle.dot}`} />
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
          onClear={() => setSimLogs([])}
          onClose={() => setIsLogOpen(false)}
          isDarkMode={isDarkMode}
        />
      )}

      <CustomAlert message={alertMessage} onClose={() => setAlertMessage('')} isDarkMode={isDarkMode} />
      <CustomConfirm message={confirmMessage} onConfirm={handleConfirmYes} onCancel={handleConfirmNo} isDarkMode={isDarkMode} />
    </div>
  );
};

export default SimulationScreen;
