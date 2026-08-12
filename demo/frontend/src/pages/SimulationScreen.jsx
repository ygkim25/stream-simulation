import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import Header from '../components/Header';
import AlarmSidebar from '../components/AlarmSidebar';
import FullLogModal from '../components/FullLogModal';
import CustomAlert from '../components/CustomAlert';
import CustomConfirm from '../components/CustomConfirm';
import SimulationTrendChart from '../components/SimulationTrendChart';
import Dropdown from '../components/Dropdown';
import { listScenarios, getScenarioDetail, uploadScenario, updateScenarioRows, deleteScenarioApi, renameScenarioApi } from '../utils/simulationApi';
import { parseSimulationFile, computeStatus, isWarningStatus, formatMmSs, formatClockTime } from '../utils/simulationParse';
import { STATUS_STYLES, getStatusMeta } from '../utils/statusStyles';
import { useClickOutside } from '../utils/useClickOutside';
import { compareByEquipId, STATUS_SORT_ORDER } from '../utils/sortHelpers';

const SPEED_OPTIONS = [1, 2, 4, 8];

// 상태(정상/경고/위험) 타임라인 바 색상
const TIMELINE_COLOR = {
  green: { dark: '#34D399', light: '#22C55E' },
  amber: { dark: '#FBBF24', light: '#F59E0B' },
  red: { dark: '#FB5D75', light: '#EF4444' },
};

// ==========================================
// 설비 하나의 전체 시나리오 구간(시작~끝) 상태 흐름을 색 띠로 보여주는 미니 타임라인
// 재생 위치(playheadPct)를 세로선으로 표시해서 "지금 이 지점"이 전체에서 어디쯤인지 보여줌
// ==========================================
const EquipTimelineBar = ({ segments, playheadPct, isDarkMode }) => {
  const trackColor = isDarkMode ? '#0D1224' : '#F3F4F6';
  if (!segments || segments.length === 0) {
    return <div className="w-full h-3.5 rounded" style={{ backgroundColor: trackColor }} />;
  }
  return (
    <div className="relative w-full h-3.5 rounded overflow-hidden flex" style={{ backgroundColor: trackColor }}>
      {segments.map((seg, i) => (
        <div
          key={i}
          style={{ width: `${seg.widthPct}%`, backgroundColor: TIMELINE_COLOR[seg.color][isDarkMode ? 'dark' : 'light'] }}
        />
      ))}
      {playheadPct != null && (
        <div
          className={`absolute top-0 bottom-0 w-[2px] ${isDarkMode ? 'bg-white' : 'bg-gray-900'}`}
          style={{ left: `${Math.min(Math.max(playheadPct, 0), 100)}%` }}
        />
      )}
    </div>
  );
};

// ==========================================
// 값 수정 셀 (온도/전력/임계값 입력창)
// 입력 중에 부모가 재계산한 값으로 되돌아가 버리면(지워도 바로 원래 숫자로 튀는 등) 편집이
// 매끄럽지 않아서, 자체 로컬 상태로 입력값을 들고 있음. key를 "그 행 자체의 시간"으로 줘서
// 재생이 다음 데이터 행으로 넘어갈 때만 리마운트되어 새 값으로 갱신되고,
// 같은 행에서 수정만 하는 동안에는 부모 리렌더링에 영향받지 않고 그대로 유지됨
// ==========================================
const EditableCell = ({ initialValue, onChangeValue, className }) => {
  const [value, setValue] = useState(initialValue);
  // "이후 전체 적용"으로 다른 행을 수정하면 이 행의 계산된 값도 바뀌는데, 이 행 자체의 key는
  // 그대로라 컴포넌트가 리마운트되지 않음 -> prop이 바뀌면 화면에 보이는 값도 따라가도록 동기화
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

// ==========================================
// 시뮬레이션 모드 화면 (과거 장애 이력 엑셀을 업로드해 재생하며 시나리오를 테스트)
// 시나리오는 백엔드 simulation_scenario 테이블에 저장 (유저별 소유권 분리)
// ==========================================
const SimulationScreen = ({ user, setRoute, openMyPage, isDarkMode, setIsDarkMode }) => {
  const [scenarios, setScenarios] = useState([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState(null);
  const [rows, setRows] = useState([]); // 선택된 시나리오의 정규화된 원본 로우 (시간순 정렬)

  const [playState, setPlayState] = useState('stopped'); // 'stopped' | 'playing' | 'paused'
  const [elapsedMs, setElapsedMs] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [editedValues, setEditedValues] = useState({}); // { equipId: { temperature?, power?, threshold? } -> { [timeMs]: { value, forward } } }
  // 셀 수정 시 적용 범위: false=그 시점만(스파이크), true=그 시점 이후 전체
  const [applyForward, setApplyForward] = useState(false);

  // 셀 수정 되돌리기(Undo) - 수정 직전의 editedValues 스냅샷을 쌓아뒀다가 순서대로 복원함.
  // 같은 셀에 연속으로 타이핑하는 동안(같은 equipId/field/시각)은 한 단계로 묶고,
  // 다른 셀을 고치기 시작하는 순간에만 새 단계를 쌓음
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
  const handleAlarmClick = useCallback((alarm) => {
    const rowEl = document.getElementById(`equip-row-${alarm.equipId}`);
    if (rowEl) {
      rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    setClickHighlightId(alarm.equipId);
    if (clickHighlightTimeoutRef.current) clearTimeout(clickHighlightTimeoutRef.current);
    clickHighlightTimeoutRef.current = setTimeout(() => {
      setClickHighlightId(null);
    }, 1500);
  }, []);

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

  // 한 번이라도 수정 후 저장된 시나리오 id 목록 (백엔드에 별도 컬럼이 없어 브라우저에 임시로만 기록 -
  // 새로고침해도 유지되지만, 다른 브라우저/기기에는 표시되지 않음)
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
    try {
      const detail = await getScenarioDetail(scenario.id, user?.token);
      setRows(detail.rows || []);
    } catch (err) {
      console.error('시나리오 상세 조회 실패:', err);
      showAlert('시나리오를 불러오는 중 오류가 발생했습니다.');
      setRows([]);
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

  // 설비별 상태 전환(정상↔경고/위험) 이벤트를 시작 시각 기준 경과시간(ms)으로 미리 계산
  const transitionEvents = useMemo(() => {
    if (!rows.length) return [];
    const byEquip = new Map();
    rows.forEach(r => {
      if (!byEquip.has(r.equipId)) byEquip.set(r.equipId, []);
      byEquip.get(r.equipId).push(r);
    });

    const events = [];
    byEquip.forEach((list) => {
      const sorted = [...list].sort((a, b) => a.time.getTime() - b.time.getTime());
      let prevStatus = null;
      sorted.forEach(r => {
        if (r.status !== prevStatus) {
          if (isWarningStatus(r.status)) {
            events.push({
              id: `${r.equipId}-${r.time.getTime()}`,
              equipId: r.equipId,
              equipName: r.equipName,
              location: r.location,
              elapsedMs: r.time.getTime() - startTimeMs,
              kind: 'warning',
              value: r.temperature,
              threshold: r.threshold,
            });
          } else if (prevStatus && isWarningStatus(prevStatus)) {
            events.push({
              id: `log-${r.equipId}-${r.time.getTime()}`,
              equipId: r.equipId,
              equipName: r.equipName,
              elapsedMs: r.time.getTime() - startTimeMs,
              kind: 'success',
              value: r.temperature,
              threshold: r.threshold,
            });
          }
        }
        prevStatus = r.status;
      });
    });
    events.sort((a, b) => a.elapsedMs - b.elapsedMs);
    return events;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

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

  // 특정 설비/필드/시각(timeMs)에 적용될 수정값을 찾음.
  // 1) 그 시각에 정확히 등록된 수정이 있으면 그 값을 그대로 사용
  // 2) 없으면, 그 시각 이전에 등록된 수정 중 "이후 전체 적용"으로 남긴 것 중 가장 최근 것을 이어서 적용
  //    (스파이크로 남긴 수정은 그 시각에만 적용되고 다음 행부터는 전파되지 않음)
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
        const temperature = editedTemp !== undefined ? editedTemp : r.temperature;
        const power = editedPower !== undefined ? editedPower : r.power;
        const threshold = editedThreshold !== undefined ? editedThreshold : r.threshold;
        const status = (editedTemp !== undefined || editedThreshold !== undefined) ? computeStatus(temperature, threshold) : r.status;
        return { ...r, temperature, power, threshold, status };
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
          case 'status':
            cmp = STATUS_SORT_ORDER[a.status] - STATUS_SORT_ORDER[b.status];
            break;
          default:
            cmp = compareByEquipId(a, b);
        }
        return cmp * dir;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, elapsedMs, editedValues, startTimeMs, sortColumn, sortDirection]);

  // 설비별 "시작~끝" 전체 상태 흐름을 색 구간으로 미리 계산 (재생 위치와 무관하게 한 번만 계산됨 -
  // elapsedMs가 deps에 없어서 재생 중에도 매 틱마다 다시 계산되지 않음)
  const equipTimelines = useMemo(() => {
    if (!rows.length || durationMs <= 0) return {};
    const byEquip = new Map();
    rows.forEach(r => {
      if (!byEquip.has(r.equipId)) byEquip.set(r.equipId, []);
      byEquip.get(r.equipId).push(r);
    });

    const scenarioEndMs = startTimeMs + durationMs;
    const result = {};
    byEquip.forEach((list, equipId) => {
      const sorted = [...list].sort((a, b) => a.time.getTime() - b.time.getTime());
      const resolved = sorted.map(r => {
        const rowTime = r.time.getTime();
        const editedTemp = resolveEditedValue(equipId, 'temperature', rowTime);
        const editedThreshold = resolveEditedValue(equipId, 'threshold', rowTime);
        const temperature = editedTemp !== undefined ? editedTemp : r.temperature;
        const threshold = editedThreshold !== undefined ? editedThreshold : r.threshold;
        const status = (editedTemp !== undefined || editedThreshold !== undefined) ? computeStatus(temperature, threshold) : r.status;
        return { time: rowTime, color: getStatusMeta(status).color };
      });

      const segments = [];
      resolved.forEach((point, idx) => {
        const segEnd = idx < resolved.length - 1 ? resolved[idx + 1].time : scenarioEndMs;
        const widthPct = ((segEnd - point.time) / durationMs) * 100;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, editedValues, startTimeMs, durationMs]);

  // 선택한 설비의 "지금까지" 추이 (재생 위치가 앞으로 갈수록 점이 이어져 그려짐)
  const selectedEquipSeries = useMemo(() => {
    if (!selectedEquipId || !rows.length) return [];
    const cutoff = startTimeMs + elapsedMs;
    return rows
      .filter(r => r.equipId === selectedEquipId && r.time.getTime() <= cutoff)
      .sort((a, b) => a.time.getTime() - b.time.getTime())
      .map(r => {
        const rowTime = r.time.getTime();
        const editedTemp = resolveEditedValue(r.equipId, 'temperature', rowTime);
        const editedPower = resolveEditedValue(r.equipId, 'power', rowTime);
        return {
          time: formatClockTime(r.time),
          temperature: editedTemp !== undefined ? editedTemp : r.temperature,
          power: editedPower !== undefined ? editedPower : r.power,
        };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, selectedEquipId, elapsedMs, editedValues, startTimeMs]);

  // 셀 직접 수정 (온도/전력/임계값) -> applyForward가 꺼져 있으면 그 행 자체의 시각에만 값을
  // 덮어씀 (다음 원본 데이터 행부터는 자동으로 원래 값으로 돌아감 - 한 번의 스파이크처럼 동작).
  // applyForward가 켜져 있으면 그 시각 이후 모든 행에도 값이 이어서 적용됨 (다음 forward 수정이
  // 나오기 전까지 계속 유지). 행 객체를 그대로 받아서 처리하므로 "현재 재생 시점" 표든,
  // "설비별 전체 이력" 표든 어떤 행이든 동일하게 수정할 수 있음.
  // 온도나 임계값이 바뀌면 즉시 재판정하여, 새로 경고/위험에 진입하면 알람에도 바로 반영 (시나리오 테스트용).
  // 전력은 상태 판정에 영향 없음
  const handleCellValueEdit = (row, field, rawValue) => {
    const equipId = row.equipId;
    const anchorTime = row.time.getTime();
    const newValue = rawValue === '' ? '' : Number(rawValue);

    // 같은 셀을 연속으로 고치는 동안(타이핑 중)은 되돌리기 한 단계로 묶고,
    // 다른 셀로 넘어가는 순간에만 그 직전 상태를 되돌리기 스택에 쌓음
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

    if (field === 'power') return;
    if (newValue === '' || isNaN(newValue)) return;
    const temperature = field === 'temperature' ? newValue : row.temperature;
    const threshold = field === 'threshold' ? newValue : row.threshold;
    const newStatus = computeStatus(temperature, threshold);
    if (isWarningStatus(newStatus) && newStatus !== row.status) {
      const now = new Date();
      const timeLabel = now.toLocaleTimeString('ko-KR');
      const cardId = `manual-${equipId}-${now.getTime()}`;
      setSimAlarms(p => [...p, {
        id: cardId,
        equipId,
        equipName: row.equipName,
        time: timeLabel,
        value: temperature,
        threshold,
        location: row.location || '-',
      }]);
      setSimLogs(p => [...p, {
        id: `log-${cardId}`,
        time: timeLabel,
        type: 'warning',
        equipName: row.equipName,
        message: `임계값 초과 감지 (${newStatus}) [수동 수정]`,
        value: temperature,
        threshold,
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

  const handleClearAlarms = () => {
    setSimAlarms([]);
  };

  // 시나리오 파일 업로드 및 파싱 -> 백엔드 저장 -> 자동 선택
  const handleFileUpload = async (file) => {
    if (!file) return;
    try {
      const { rows: parsedRows, missingTimeCount } = await parseSimulationFile(file);
      if (parsedRows.length === 0) {
        showAlert('엑셀에서 유효한 데이터를 찾을 수 없습니다. ID 컬럼이 있는지 확인해 주세요.');
        return;
      }
      if (missingTimeCount === parsedRows.length) {
        showAlert('"수신 시간" 컬럼을 찾을 수 없어 업로드 순서 기준으로 임시 시간이 부여됩니다.');
      }
      const saved = await uploadScenario(file.name, parsedRows, user?.token);
      await loadScenarios();
      resetPlayback();
      setSelectedScenarioId(saved.id);
      setRows(saved.rows || parsedRows);
    } catch (err) {
      console.error('시뮬레이션 파일 업로드 실패:', err);
      showAlert('엑셀 파일을 업로드하는 중 오류가 발생했습니다.');
    }
  };

  const handleFileInputChange = (e) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
    e.target.value = '';
  };

  // 지금까지의 모든 수정을 각자 등록된 그 행에만 반영한 전체 rows 계산
  // (수정하지 않은 다른 행들은 원본 값 그대로 유지됨)
  const getRowsWithEdits = () => {
    return rows.map(r => {
      const rowTime = r.time.getTime();
      const editedTemp = resolveEditedValue(r.equipId, 'temperature', rowTime);
      const editedPower = resolveEditedValue(r.equipId, 'power', rowTime);
      const editedThreshold = resolveEditedValue(r.equipId, 'threshold', rowTime);
      if (editedTemp === undefined && editedPower === undefined && editedThreshold === undefined) return r;
      const temperature = editedTemp !== undefined ? editedTemp : r.temperature;
      const power = editedPower !== undefined ? editedPower : r.power;
      const threshold = editedThreshold !== undefined ? editedThreshold : r.threshold;
      return { ...r, temperature, power, threshold, status: computeStatus(temperature, threshold) };
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
    showAlert('저장되었습니다.');
  };

  // 현재 화면에 보이는 데이터(수정 중인 값 포함)를 엑셀 파일로 내보내기 (저장 여부와 무관)
  const handleExportScenario = () => {
    if (!selectedScenario) {
      showAlert('내보낼 시나리오를 먼저 선택하세요.');
      return;
    }

    const exportRows = getRowsWithEdits();

    // 엑셀 파일로 내보내기
    const exportData = exportRows.map(r => ({
      'ID': `#${r.equipId}`,
      '설비명': r.equipName,
      '위치': r.location || '-',
      '수신 시간': r.time.toLocaleString('ko-KR'),
      '온도(℃)': r.temperature != null && !isNaN(r.temperature) ? Number(r.temperature).toFixed(1) : '-',
      '전력': r.power != null && !isNaN(r.power) ? Number(r.power).toFixed(1) : '-',
      '임계값(온도)': r.threshold,
      '상태': r.status,
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    worksheet['!cols'] = [
      { wch: 8 }, { wch: 15 }, { wch: 12 }, { wch: 25 }, { wch: 10 }, { wch: 10 }, { wch: 15 }, { wch: 10 }
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '시뮬레이션');

    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = today.toTimeString().slice(0, 5).replace(':', '');
    const baseName = selectedScenario.fileName.replace(/\.(xlsx|xls)$/i, '');
    XLSX.writeFile(workbook, `${baseName}_수정_${dateStr}_${timeStr}.xlsx`);
  };

  // 현재 상태 기준 정상/경고/위험 개수 (알람 패널 하단 뱃지용)
  const statusCounts = currentEquipRows.reduce((acc, eq) => {
    const label = getStatusMeta(eq.status).label;
    if (label === '위험') acc.danger += 1;
    else if (label === '경고') acc.warning += 1;
    else acc.normal += 1;
    return acc;
  }, { normal: 0, warning: 0, danger: 0 });

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
        const temperature = editedTemp !== undefined ? editedTemp : r.temperature;
        const power = editedPower !== undefined ? editedPower : r.power;
        const threshold = editedThreshold !== undefined ? editedThreshold : r.threshold;
        const status = (editedTemp !== undefined || editedThreshold !== undefined) ? computeStatus(temperature, threshold) : r.status;
        return { ...r, temperature, power, threshold, status };
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
          <span className={`text-[9px] ${isActive ? '' : 'opacity-0'}`}>{sortDirection === 'asc' ? '▲' : '▼'}</span>
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
                  className={`self-start text-base font-semibold whitespace-nowrap px-2 py-1 rounded-lg border border-transparent transition-colors ${
                    selectedScenario ? 'cursor-pointer' : 'invisible pointer-events-none'
                  } ${
                    isDarkMode ? 'text-[#EDF1FC] hover:bg-[#0D1224] hover:border-[#232B45]' : 'text-gray-800 hover:bg-gray-50 hover:border-gray-200'
                  }`}
                >
                  {selectedScenario?.fileName || ' '}
                </button>
              )}

              {/* 이 시나리오 데이터의 실제 시간 범위 (시작 ~ 끝) */}
              <span className={`text-[11px] font-mono whitespace-nowrap px-2 ${
                selectedScenario && rows.length > 0 ? '' : 'invisible'
              } ${isDarkMode ? 'text-[#7D87A8]' : 'text-gray-500'}`}>
                {selectedScenario && rows.length > 0
                  ? `${new Date(startTimeMs).toLocaleString('ko-KR')} ~ ${new Date(startTimeMs + durationMs).toLocaleString('ko-KR')}`
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

            {scenarios.length === 0 ? (
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
                  <p className={`text-xs font-bold truncate pr-5 flex items-center ${isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-800'}`}>
                    <span className="truncate">{s.fileName}</span>
                    {editedScenarioIds.has(s.id) && (
                      <span
                        title="수정 후 저장된 시나리오입니다"
                        className={`shrink-0 ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                          isDarkMode ? 'bg-[#22D3EE]/15 text-[#22D3EE]' : 'bg-green-100 text-green-700'
                        }`}
                      >
                        수정됨
                      </span>
                    )}
                  </p>
                  <p className={`text-[10px] font-mono mt-0.5 ${isDarkMode ? 'text-[#7D87A8]' : 'text-gray-400'}`}>
                    {new Date(s.uploadedAt).toLocaleString('ko-KR')}
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
              const file = e.dataTransfer.files?.[0];
              if (file) handleFileUpload(file);
            }}
            className={`relative flex-1 min-w-0 rounded-xl p-3.5 sm:p-5 flex flex-col border transition-colors min-h-[450px] lg:min-h-0 lg:overflow-hidden ${
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
            ) : (
              <>
              {viewEquipId ? (
                <>
                {/* 실시간 추이 그래프 (드롭다운에서 설비를 선택했을 때만 표시) */}
                <div className={`shrink-0 mb-3 pb-3 border-b ${isDarkMode ? 'border-[#1E253D]' : 'border-gray-200'}`}>
                  <SimulationTrendChart
                    data={selectedEquipSeries}
                    threshold={currentEquipRows.find(r => r.equipId === selectedEquipId)?.threshold}
                    equipName={selectedEquipName}
                    isDarkMode={isDarkMode}
                  />
                </div>

                {/* 설비별 전체 시간 이력 보기 (읽기 전용) */}
                <div className="flex-1 overflow-x-auto overflow-y-auto min-h-0 custom-scrollbar">
                  <table className="w-full text-center border-collapse table-fixed min-w-[600px]">
                    <thead className={`sticky top-0 text-[11px] z-10 transition-colors ${
                      isDarkMode ? 'bg-[#0D1224] text-[#7D87A8]' : 'bg-gray-50 text-gray-500'
                    }`}>
                      <tr className="h-[40px]">
                        <th className={`w-[24%] px-3 border-b font-semibold uppercase ${isDarkMode ? 'border-[#2A335A]' : 'border-gray-300'}`}>수신 시간</th>
                        <th className={`w-[19%] px-3 border-b font-semibold uppercase ${isDarkMode ? 'border-[#2A335A]' : 'border-gray-300'}`}>온도(℃)</th>
                        <th className={`w-[19%] px-3 border-b font-semibold uppercase ${isDarkMode ? 'border-[#2A335A]' : 'border-gray-300'}`}>전력</th>
                        <th className={`w-[19%] px-3 border-b font-semibold uppercase ${isDarkMode ? 'border-[#2A335A]' : 'border-gray-300'}`}>임계값(온도)</th>
                        <th className={`w-[19%] px-3 border-b font-semibold uppercase ${isDarkMode ? 'border-[#2A335A]' : 'border-gray-300'}`}>상태</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y text-xs sm:text-[13px] ${isDarkMode ? 'divide-[#2A335A] text-[#B9C2DE]' : 'divide-gray-300 text-gray-600'}`}>
                      {equipHistoryRows.length === 0 ? (
                        <tr>
                          <td colSpan={5} className={`px-3.5 py-10 text-center ${isDarkMode ? 'text-[#7D87A8]' : 'text-gray-400'}`}>
                            이 설비의 데이터가 없습니다.
                          </td>
                        </tr>
                      ) : (
                        equipHistoryRows.map((r, idx) => {
                          const statusMeta = getStatusMeta(r.status);
                          const statusStyle = STATUS_STYLES[statusMeta.color][isDarkMode ? 'dark' : 'light'];
                          const isDanger = statusMeta.color === 'red';
                          const isWarning = statusMeta.color === 'amber';
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
                                {r.time.toLocaleString('ko-KR')}
                              </td>
                              <td className={`px-3 py-0 h-[44px] align-middle`}>
                                <EditableCell
                                  key={`hist-temp-${r.equipId}-${r.time.getTime()}`}
                                  initialValue={r.temperature}
                                  onChangeValue={(v) => handleCellValueEdit(r, 'temperature', v)}
                                  className={`w-[64px] h-[28px] mx-auto block rounded px-1.5 text-center font-bold focus:outline-none border text-xs leading-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                                    isDarkMode ? 'bg-[#0D1224] border-[#2A335A] focus:border-[#22D3EE]' : 'bg-white border-gray-300 focus:border-green-600'
                                  } ${statusMeta.color === 'green' ? (isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-800') : statusStyle.text}`}
                                />
                              </td>
                              <td className={`px-3 py-0 h-[44px] align-middle`}>
                                <EditableCell
                                  key={`hist-power-${r.equipId}-${r.time.getTime()}`}
                                  initialValue={r.power ?? ''}
                                  onChangeValue={(v) => handleCellValueEdit(r, 'power', v)}
                                  className={`w-[64px] h-[28px] mx-auto block rounded px-1.5 text-center font-bold focus:outline-none border text-xs leading-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                                    isDarkMode ? 'bg-[#0D1224] border-[#2A335A] text-[#EDF1FC] focus:border-[#22D3EE]' : 'bg-white border-gray-300 text-gray-800 focus:border-green-600'
                                  }`}
                                />
                              </td>
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
                              <td className="px-3 py-0 h-[44px]">
                                <div className={`h-full flex items-center justify-center gap-1 text-xs font-bold whitespace-nowrap ${statusStyle.text}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
                                  {statusMeta.label}
                                </div>
                              </td>
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
                      {renderSortableHeader('equipId', 'ID', 'w-[7%]')}
                      {renderSortableHeader('equipName', '설비명', 'w-[11%]')}
                      {renderSortableHeader('location', '위치', 'w-[5%]')}
                      {renderSortableHeader('time', '수신 시간', 'w-[19%]')}
                      {renderSortableHeader('temperature', '온도(℃)', 'w-[9%]')}
                      {renderSortableHeader('power', '전력', 'w-[8%]')}
                      {renderSortableHeader('threshold', '임계값(온도)', 'w-[9%]')}
                      {renderSortableHeader('status', '상태', 'w-[8%]')}
                      <th className={`w-[14%] px-3 border-b font-semibold uppercase ${isDarkMode ? 'border-[#2A335A]' : 'border-gray-300'}`}>전체 흐름</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y text-xs sm:text-[13px] ${isDarkMode ? 'divide-[#2A335A] text-[#B9C2DE]' : 'divide-gray-300 text-gray-600'}`}>
                    {currentEquipRows.length === 0 ? (
                      <tr>
                        <td colSpan={9} className={`px-3.5 py-10 text-center ${isDarkMode ? 'text-[#7D87A8]' : 'text-gray-400'}`}>
                          재생을 시작하면 데이터가 표시됩니다.
                        </td>
                      </tr>
                    ) : (
                      currentEquipRows.map(eq => {
                        const playheadPct = durationMs > 0 ? (elapsedMs / durationMs) * 100 : null;
                        const statusMeta = getStatusMeta(eq.status);
                        const statusStyle = STATUS_STYLES[statusMeta.color][isDarkMode ? 'dark' : 'light'];
                        const isSelected = selectedEquipId === eq.equipId;
                        const isDanger = statusMeta.color === 'red';
                        const isWarning = statusMeta.color === 'amber';
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
                            <td className={`px-3 py-0 h-[52px] text-[13px] truncate align-middle ${isDarkMode ? 'text-[#9FACC9]' : 'text-gray-600'}`}>
                              {eq.location || '-'}
                            </td>
                            <td className={`px-3 py-0 h-[52px] font-mono text-[13px] whitespace-nowrap align-middle ${isDarkMode ? 'text-[#7D87A8]' : 'text-gray-500'}`}>
                              {eq.time.toLocaleString('ko-KR')}
                            </td>
                            <td className={`px-3 py-0 h-[52px] align-middle`}>
                              <EditableCell
                                key={`temp-${eq.equipId}-${eq.time.getTime()}`}
                                initialValue={eq.temperature}
                                onChangeValue={(v) => handleCellValueEdit(eq, 'temperature', v)}
                                className={`w-[70px] h-[30px] mx-auto block rounded px-1.5 text-center font-bold focus:outline-none border text-xs leading-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                                  isDarkMode ? 'bg-[#0D1224] border-[#2A335A] focus:border-[#22D3EE]' : 'bg-white border-gray-300 focus:border-green-600'
                                } ${statusMeta.color === 'green' ? (isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-800') : statusStyle.text}`}
                              />
                            </td>
                            <td className={`px-3 py-0 h-[52px] align-middle`}>
                              <EditableCell
                                key={`power-${eq.equipId}-${eq.time.getTime()}`}
                                initialValue={eq.power ?? ''}
                                onChangeValue={(v) => handleCellValueEdit(eq, 'power', v)}
                                className={`w-[70px] h-[30px] mx-auto block rounded px-1.5 text-center font-bold focus:outline-none border text-xs leading-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                                  isDarkMode ? 'bg-[#0D1224] border-[#2A335A] text-[#EDF1FC] focus:border-[#22D3EE]' : 'bg-white border-gray-300 text-gray-800 focus:border-green-600'
                                }`}
                              />
                            </td>
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
                            <td className={`px-3 py-0 h-[52px]`}>
                              <div className={`h-full flex items-center justify-center gap-1 text-xs font-bold whitespace-nowrap ${statusStyle.text}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
                                {statusMeta.label}
                              </div>
                            </td>
                            <td className="px-3 py-0 h-[52px] align-middle">
                              <EquipTimelineBar segments={equipTimelines[eq.equipId]} playheadPct={playheadPct} isDarkMode={isDarkMode} />
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
