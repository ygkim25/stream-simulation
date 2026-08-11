import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { Client } from '@stomp/stompjs';
import Header from '../components/Header';
import AlarmSidebar from '../components/AlarmSidebar';
import CustomAlert from '../components/CustomAlert';
import CustomConfirm from '../components/CustomConfirm';
import EquipmentHistoryModal from '../components/EquipmentHistoryModal';
import EquipmentTrendGrid from '../components/EquipmentTrendGrid';
import { saveToDB, getAllFromDB } from '../utils/indexedDb';
import { formatForDateTimeInput } from '../utils/dateFormat';
import { STATUS_STYLES, getStatusMeta } from '../utils/statusStyles';

// 화면에 표시할 알람 최대 개수
const MAX_ALARMS = 100;
const MAX_LOGS = 500;

// ==========================================
// 실시간 모니터링 화면 컴포넌트
// ==========================================
const RealtimeScreen = ({
  user,
  setRoute,
  openMyPage,
  alarms = [],
  setAlarms,
  setLogs,
  openLogs,
  isDarkMode,
  setIsDarkMode
}) => {
  const [tabMode, setTabMode] = useState('stream');
  const [selectedEquipId, setSelectedEquipId] = useState(null);
  const isAdmin = user?.role === 'ADMIN' || user?.userId === 'admin';
  // 설비 클릭 시 온도/전력 히스토리 차트 팝업에 띄울 설비 ID
  const [historyEquipId, setHistoryEquipId] = useState(null);
  // 추이 카드에서 특정 그래프(온도/전력)만 클릭해서 들어온 경우, 해당 그래프만 크게 보여주기 위한 값
  const [historyMetric, setHistoryMetric] = useState(null);
  // ID / 설비명 검색어
  const [equipSearch, setEquipSearch] = useState('');

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
  const [isConnected, setIsConnected] = useState(false);
  const [loadError, setLoadError] = useState('');
  // 설정 탭 (설비명/위치/임계값)
  const [editedFields, setEditedFields] = useState({});
  
  // 누적 데이터 카운트
  const [accumulatedCount, setAccumulatedCount] = useState(0);
  const [flash, setFlash] = useState(false);
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

  const stompClientRef = useRef(null);
  const gridScrollRef = useRef(null);

  // 알림 매핑 시 최신 설비명/위치를 참조하기 위한 ref
  // (useEffect로 state를 미러링하면 웹소켓 메시지가 연달아 도착할 때 ref가 한 렌더 뒤처져서
  //  상태 전환이 아닌데도 전환으로 오탐지될 수 있어, 웹소켓 핸들러에서 직접 동기적으로 갱신함)
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

  // 웹소켓 연결
  useEffect(() => {
    let isMounted = true;

    const setupWebSocket = async () => {
      const existing = await getAllFromDB();
      if (isMounted) setAccumulatedCount(existing.length);

      // 기존 클라이언트가 살아있다면 해제 후 재연결
      if (stompClientRef.current) {
        stompClientRef.current.deactivate();
      }

      const client = new Client({
        brokerURL: 'ws://localhost:8086/ws/websocket',

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

          client.subscribe('/topic/live/monitoring', async (message) => {
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
                // 실시간 스트림에서 상태 전환(정상↔경고/위험)이 감지되면 noti-warn/logs를 재조회함
                // (짧은 시간에 여러 건이 몰려도 scheduleAlertsFetch가 한 번으로 묶어서 요청함)
                let hasTransition = false;
                const updated = [...equipmentsRef.current];
                newDataList.forEach(newItem => {
                  const idx = updated.findIndex(eq => eq.equipId === newItem.equipId);
                  const prevStatus = idx >= 0 ? updated[idx].status : undefined;
                  if (idx >= 0 && newItem.status !== prevStatus) {
                    hasTransition = true;
                  }
                  if (idx >= 0) {
                    updated[idx] = newItem;
                  } else {
                    updated.push(newItem);
                  }
                });
                equipmentsRef.current = updated;

                if (hasTransition) {
                  scheduleAlertsFetch();
                }

                // 설비 ID로 비교해서 변경된 로우만 갱신 (전체 목록을 덮어쓰지 않음)
                setEquipments(updated);

                setFlash(true);
                setTimeout(() => {
                  if (isMounted) setFlash(false);
                }, 500);

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

                // 컴포넌트가 정상 마운트 상태일 때만 정확히 수신 개수만큼 누적 (+20)
                if (isMounted) {
                  setAccumulatedCount(prev => prev + newDataList.length);
                }
              }
            } catch (e) {
              console.error('웹소켓 데이터 파싱 에러:', e);
            }
          });
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

  // 알림 전체 지우기 (백엔드 noti-warn 이력도 함께 초기화해야 재조회 시 다시 나타나지 않음)
  const handleClearAlarms = async () => {
    try {
      await axios.post('http://localhost:8086/api/live/monitoring/noti-warn/clear', {}, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
    } catch (err) {
      console.error('알람 초기화 실패:', err);
    }
    dismissedAlarmIdsRef.current = new Set();
    try {
      localStorage.removeItem('dismissedAlarmIds');
    } catch (e) {
      console.error('알람 삭제 목록 초기화 실패:', e);
    }
    setAlarms([]);
  };

  // 임계값 탭에 "진입할 때" 한 번만 값 세팅 (equipments를 deps에 넣으면 실시간 웹소켓
  // 업데이트가 올 때마다 이 effect가 다시 돌면서 입력 중이던 값을 원래 값으로 덮어써버림)
  useEffect(() => {
    if (tabMode === 'threshold') {
      const initialMap = {};
      equipments.forEach(eq => {
        initialMap[eq.equipId] = {
          equipName: eq.equipName ?? '',
          location: eq.location ?? '',
          threshold: eq.threshold ?? '',
        };
      });
      setEditedFields(initialMap);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabMode]);

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
  const handleStartTimeChange = (e) => {
    if (!e.target.value) return;
    const selectedStart = new Date(e.target.value);

    if (selectedStart > endTime) {
      showAlert('시작 시각은 종료 시각보다 나중일 수 없습니다.');
      return;
    }
    setStartTime(selectedStart);
    setSelectedPreset(''); // 수동으로 시간을 바꾸면 프리셋 선택 표시 해제
  };

  // 종료 시간 변경 처리
  const handleEndTimeChange = (e) => {
    if (!e.target.value) return;
    const selectedEnd = new Date(e.target.value);

    if (selectedEnd < startTime) {
      showAlert('종료 시각은 시작 시각보다 빠를 수 없습니다.');
      return;
    }
    setEndTime(selectedEnd);
    setSelectedPreset(''); // 수동으로 시간을 바꾸면 프리셋 선택 표시 해제
  };

  // 엑셀 내보내기 (선택한 자유 시간 범위 데이터 추출)
  const handleExport = async () => {
    if (startTime >= endTime) {
      showAlert('시작 시각은 종료 시각보다 빨라야 합니다.');
      return;
    }

    try {
      const accumulatedData = await getAllFromDB();

      if (!accumulatedData || accumulatedData.length === 0) {
        showAlert('내보낼 누적 데이터가 없습니다.');
        return;
      }

      const startMs = startTime.getTime();
      const endMs = endTime.getTime();

      // 지정한 [startTime ~ endTime] 유효 범위 데이터 필터링
      const filteredData = accumulatedData.filter(item => {
        if (!item.receivedAt) return true;
        const itemMs = new Date(item.receivedAt).getTime();
        return itemMs >= startMs && itemMs <= endMs;
      });

      if (filteredData.length === 0) {
        const startStr = startTime.toLocaleString('ko-KR');
        const endStr = endTime.toLocaleString('ko-KR');
        showAlert(`지정한 시간 구간 (${startStr} ~ ${endStr}) 내 수신 데이터가 없습니다.`);
        return;
      }

      const exportData = filteredData.map(eq => ({
        'ID': `#${String(eq.equipId).padStart(3, '0')}`,
        '설비명': eq.equipName,
        '위치': eq.location || '-',
        '수신 시간': eq.receivedAt ? new Date(eq.receivedAt).toLocaleString('ko-KR') : '-',
        '온도(℃)': eq.temperature != null ? Number(eq.temperature).toFixed(1) : '-',
        '전력': eq.power != null ? Number(eq.power).toFixed(1) : '-',
        '임계값(온도)': eq.threshold ?? '-',
        '상태': getStatusMeta(eq.status).label
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      worksheet['!cols'] = [
        { wch: 8 }, { wch: 15 }, { wch: 12 }, { wch: 25 }, { wch: 10 }, { wch: 10 }, { wch: 15 }, { wch: 10 }
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, '시간범위_누적데이터');

      const today = new Date();
      const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
      const timeStr = today.toTimeString().slice(0, 5).replace(':', '');
      const fileName = `설비모니터링_구간추출_${dateStr}_${timeStr}.xlsx`;

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

  // 설비 그리드만 최신 데이터로 다시 불러오기 (전체 새로고침 없이)
  const fetchEquipments = async () => {
    try {
      const response = await axios.get('http://localhost:8086/api/live/monitoring', {
        headers: user?.token ? { Authorization: `Bearer ${user.token}` } : {},
      });
      const data = response.data || [];
      equipmentsRef.current = data;
      setEquipments(data);
    } catch (err) {
      console.error('설비 목록 갱신 실패:', err);
    }
  };

  // 알람 조회
  const fetchAlerts = async () => {
    if (!user?.token) return;
    try {
      const response = await axios.get('http://localhost:8086/api/live/monitoring/noti-warn', {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      const mapped = (response.data || [])
        .slice()
        .reverse() // 백엔드는 최신순(DESC)으로 내려주므로, 오래된 것이 위 / 최신이 아래로 오도록 뒤집음
        .map(item => {
          const eq = equipmentsRef.current.find(e => e.equipId === item.equipId);
          return {
            id: `${item.equipId}-${item.recordedAt}`,
            equipId: item.equipId,
            equipName: eq?.equipName || item.equipId,
            time: item.recordedAt ? new Date(item.recordedAt).toLocaleTimeString('ko-KR') : '-',
            value: item.temperature,
            threshold: item.threshold,
            location: eq?.location || '-',
          };
        })
        // 사용자가 개별 삭제(x)한 알람은 재조회 시 다시 나타나지 않도록 제외
        .filter(a => !dismissedAlarmIdsRef.current.has(a.id));
      setAlarms(mapped.slice(-MAX_ALARMS));
    } catch (err) {
      console.error('알람 조회 실패:', err);
    }
  };

  // 로그 조회
  const fetchLogs = async () => {
    if (!user?.token) return;
    try {
      const response = await axios.get('http://localhost:8086/api/live/monitoring/logs', {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      const mapped = (response.data || [])
        .slice()
        .reverse() // 백엔드는 최신순(DESC)으로 내려주므로, 오래된 것이 위 / 최신이 아래로 오도록 뒤집음
        .map(item => ({
          id: `log-${item.equipId}-${item.createdAt}`,
          time: item.createdAt ? new Date(item.createdAt).toLocaleTimeString('ko-KR') : '-',
          type: item.type,
          equipName: item.equipName,
          message: item.message,
          value: item.value,
          threshold: item.threshold,
        }));
      setLogs(mapped.slice(-MAX_LOGS));
    } catch (err) {
      console.error('로그 조회 실패:', err);
    }
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
    for (const row of newRows) {
      if (!row.equipId.trim() || !row.equipName.trim() || !row.location.trim() ||
          row.temperature === '' || row.power === '' || row.threshold === '') {
        showAlert('신규 설비는 ID / 설비명 / 위치 / 온도 / 전력 / 임계값을 모두 입력해야 합니다.');
        return;
      }
    }

    const existingPayload = Object.entries(editedFields).map(([equipId, fields]) => ({
      equipId,
      equipName: fields.equipName,
      location: fields.location,
      threshold: fields.threshold === '' ? null : Number(fields.threshold),
    }));

    const newRowsPayload = newRows.map(row => ({
      equipId: row.equipId.trim(),
      equipName: row.equipName.trim(),
      location: row.location.trim(),
      temperature: Number(row.temperature),
      power: Number(row.power),
      threshold: Number(row.threshold),
    }));

    const payload = [...existingPayload, ...newRowsPayload];

    try {
      await axios.put(
        'http://localhost:8086/api/live/monitoring/update',
        payload,
        {
          headers: user?.token ? { Authorization: `Bearer ${user.token}` } : {},
        }
      );

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

  // input 제약 기준 시각 (현재 시각)
  const currentNowIso = formatForDateTimeInput(new Date());

  const selectedEquipName = equipments.find(e => e.equipId === selectedEquipId)?.equipName;
  const displayedAlarms = selectedEquipName
    ? alarms.filter(alarm => alarm.equipName === selectedEquipName)
    : alarms;

  // ID 오름차순 정렬 (숫자형 ID는 숫자 비교, 아니면 문자열 비교)
  const sortedEquipments = [...equipments].sort((a, b) => {
    const aNum = Number(a.equipId);
    const bNum = Number(b.equipId);
    if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) return aNum - bNum;
    return String(a.equipId).localeCompare(String(b.equipId));
  });

  // ID / 설비명 검색 필터링
  const filteredEquipments = (() => {
    const q = equipSearch.trim().toLowerCase();
    if (!q) return sortedEquipments;
    return sortedEquipments.filter(eq =>
      String(eq.equipId).toLowerCase().includes(q) || String(eq.equipName ?? '').toLowerCase().includes(q)
    );
  })();

  // 현재 설비 상태 기준 정상/경고/위험 개수 (알람 패널 요약 뱃지용)
  const statusCounts = equipments.reduce((acc, eq) => {
    const label = getStatusMeta(eq.status).label;
    if (label === '위험') acc.danger += 1;
    else if (label === '경고') acc.warning += 1;
    else acc.normal += 1;
    return acc;
  }, { normal: 0, warning: 0, danger: 0 });

  return (
    <div className={`w-full min-w-[320px] flex flex-col transition-colors h-screen max-h-[1080px] overflow-hidden ${
      isDarkMode ? 'bg-[#0A0E1A]' : 'bg-gray-50'
    }`}>
      <Header 
        title="실시간 모니터링" 
        user={user} 
        setRoute={setRoute} 
        openMyPage={openMyPage} 
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
      />

      <div className="flex-1 p-3 sm:p-4 md:p-6 flex flex-col gap-4 max-w-[1920px] mx-auto w-full overflow-hidden h-full">
        {/* 상단 컨트롤 영역 */}
        <div className={`flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl shrink-0 border transition-colors ${
          isDarkMode ? 'bg-[#12172A] border-[#1E253D]' : 'bg-white border-gray-200 shadow-sm'
        }`}>
          
          <div className="flex flex-wrap items-center gap-3">
            {/* 탭 전환 스위치 (설비 설정/값 수정은 관리자 전용) */}
            {isAdmin ? (
              <div className={`relative flex items-center p-1 rounded-full border w-[220px] shrink-0 transition-colors ${
                isDarkMode ? 'bg-[#0D1224] border-[#232B45]' : 'bg-gray-100 border-gray-200'
              }`}>
                <div
                  className={`absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-full transition-transform duration-300 ease-out border ${
                    isDarkMode ? 'bg-[#1E2A4A] border-[#22D3EE]/40' : 'bg-white border-gray-300 shadow-sm'
                  } ${tabMode === 'threshold' ? 'translate-x-full' : 'translate-x-0'}`}
                />
                <button
                  onClick={() => {
                    setNewRows([]); // 저장하지 않고 다른 탭으로 이동하면 인라인으로 추가하던 신규 행은 버림
                    setTabMode('stream');
                  }}
                  className={`relative z-10 w-1/2 py-1.5 text-center rounded-full text-xs font-bold tracking-wide transition-colors ${
                    tabMode === 'stream'
                      ? (isDarkMode ? 'text-[#22D3EE]' : 'text-green-700')
                      : (isDarkMode ? 'text-[#7D87A8] hover:text-[#B9C2DE]' : 'text-gray-500 hover:text-gray-800')
                  }`}
                >
                  실시간 스트림
                </button>
                <button
                  onClick={() => setTabMode('threshold')}
                  className={`relative z-10 w-1/2 py-1.5 text-center rounded-full text-xs font-bold tracking-wide transition-colors ${
                    tabMode === 'threshold'
                      ? (isDarkMode ? 'text-[#22D3EE]' : 'text-green-700')
                      : (isDarkMode ? 'text-[#7D87A8] hover:text-[#B9C2DE]' : 'text-gray-500 hover:text-gray-800')
                  }`}
                >
                  설정
                </button>
              </div>
            ) : (
              <span className={`text-xs font-bold tracking-wide px-3 py-1.5 ${isDarkMode ? 'text-[#22D3EE]' : 'text-green-700'}`}>
                실시간 스트림
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between lg:justify-end gap-2 sm:gap-2.5 w-full lg:w-auto">
            <div className={`flex items-center gap-2 mr-2 text-xs font-bold ${isDarkMode ? 'text-[#7D87A8]' : 'text-gray-500'}`}>
              <span className="relative flex h-2 w-2">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${flash ? 'bg-blue-500' : 'bg-transparent'}`}></span>
                <span className={`relative inline-flex rounded-full h-2 w-2 ${flash ? 'bg-blue-500' : 'bg-gray-400'}`}></span>
              </span>
              DB 수신량: <span className={isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-800'}>{accumulatedCount.toLocaleString()}건</span>
            </div>

            {/* 기간 선택 (클릭하면 편집 팝오버) - 맨 오른쪽 */}
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
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono transition-all duration-200 cursor-pointer hover:shadow-md ${
                  isDarkMode
                    ? 'bg-[#0D1224] border-[#232B45] text-[#22D3EE] hover:bg-[#151B30] hover:border-[#22D3EE]/60'
                    : 'bg-gray-50 border-gray-200 text-green-700 font-bold hover:bg-white hover:border-green-400'
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
                    <div>
                      <label className={`block text-[10px] font-bold mb-1 ${isDarkMode ? 'text-[#7D87A8]' : 'text-gray-400'}`}>시작</label>
                      <input
                        type="datetime-local"
                        max={formatForDateTimeInput(endTime)}
                        value={formatForDateTimeInput(startTime)}
                        onChange={handleStartTimeChange}
                        onMouseDown={(e) => { e.preventDefault(); e.target.showPicker?.(); }}
                        style={{ colorScheme: isDarkMode ? 'dark' : 'light' }}
                        className={`w-full rounded-lg px-2.5 py-1.5 text-xs font-mono outline-none border cursor-pointer transition-colors ${
                          isDarkMode ? 'bg-[#0D1224] border-[#232B45] text-[#EDF1FC] hover:border-[#22D3EE]/60' : 'bg-gray-50 border-gray-200 text-gray-800 hover:border-green-400'
                        }`}
                      />
                    </div>
                    <div>
                      <label className={`block text-[10px] font-bold mb-1 ${isDarkMode ? 'text-[#7D87A8]' : 'text-gray-400'}`}>종료</label>
                      <input
                        type="datetime-local"
                        min={formatForDateTimeInput(startTime)}
                        max={currentNowIso}
                        value={formatForDateTimeInput(endTime)}
                        onChange={handleEndTimeChange}
                        onMouseDown={(e) => { e.preventDefault(); e.target.showPicker?.(); }}
                        style={{ colorScheme: isDarkMode ? 'dark' : 'light' }}
                        className={`w-full rounded-lg px-2.5 py-1.5 text-xs font-mono outline-none border cursor-pointer transition-colors ${
                          isDarkMode ? 'bg-[#0D1224] border-[#232B45] text-[#EDF1FC] hover:border-[#22D3EE]/60' : 'bg-gray-50 border-gray-200 text-gray-800 hover:border-green-400'
                        }`}
                      />
                    </div>

                    <select
                      value={selectedPreset}
                      onChange={(e) => { if (e.target.value) handlePresetRange(e.target.value); }}
                      className={`w-full rounded-lg px-2.5 py-1.5 text-[11px] font-semibold border outline-none cursor-pointer ${
                        isDarkMode ? 'bg-[#151B30] border-[#2A335A] text-[#EDF1FC]' : 'bg-white border-gray-300 text-gray-700'
                      }`}
                    >
                      <option value="" disabled>빠른 선택</option>
                      <option value="FULL_1HR">최근 1시간</option>
                      <option value="FIRST_30M">이전 30분</option>
                      <option value="LAST_30M">최근 30분</option>
                      <option value="RESET_NOW">현재로 갱신</option>
                    </select>

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
          </div>
        </div>

        {/* 그리드 영역 */}
        <div className="flex-1 flex flex-col lg:flex-row gap-4 min-h-0 items-stretch overflow-hidden">
          <div className={`flex-1 min-w-0 rounded-xl p-3.5 sm:p-5 flex flex-col border transition-colors min-h-0 overflow-hidden ${
            isDarkMode ? 'bg-[#12172A] border-[#1E253D]' : 'bg-white border-gray-200 shadow-sm'
          }`}>
            <div className={`flex flex-wrap items-center justify-between gap-2 mb-3 sm:mb-4 pb-3 border-b shrink-0 min-h-[36px] ${
              isDarkMode ? 'border-[#1E253D]' : 'border-gray-200'
            }`}>
              <div className="flex items-center gap-2.5 h-8">
                <h3 className={`font-bold text-sm sm:text-[15px] tracking-tight ${
                  isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-800'
                }`}>
                  {tabMode === 'stream' ? '실시간 소켓 웹 모니터링' : '설비 설정'}
                </h3>

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
            </div>

            {/* 그리드 표 */}
            <div ref={gridScrollRef} className="flex-1 overflow-x-auto overflow-y-auto min-h-0 custom-scrollbar">
              <table className="w-full text-center border-collapse table-fixed min-w-[700px] sm:min-w-[800px]">
                <thead className={`sticky top-0 text-xs z-10 transition-colors ${
                  isDarkMode ? 'bg-[#0D1224] text-[#7D87A8]' : 'bg-gray-50 text-gray-500'
                }`}>
                  <tr className="h-[40px]">
                    <th className={`w-[9%] px-3 border-b border-r font-semibold text-center align-middle uppercase ${isDarkMode ? 'border-[#1E253D]' : 'border-gray-200'}`}>ID</th>
                    <th className={`w-[19%] px-3 border-b border-r font-semibold text-center align-middle uppercase ${isDarkMode ? 'border-[#1E253D]' : 'border-gray-200'}`}>설비명</th>
                    <th className={`w-[9%] px-3 border-b border-r font-semibold text-center align-middle uppercase ${isDarkMode ? 'border-[#1E253D]' : 'border-gray-200'}`}>위치</th>
                    <th className={`w-[14%] px-3 border-b border-r font-semibold text-center align-middle uppercase ${isDarkMode ? 'border-[#1E253D]' : 'border-gray-200'}`}>수신 시간</th>
                    <th className={`w-[13%] px-3 border-b border-r font-semibold text-center align-middle uppercase ${isDarkMode ? 'border-[#1E253D]' : 'border-gray-200'}`}>온도</th>
                    <th className={`w-[13%] px-3 border-b border-r font-semibold text-center align-middle uppercase ${isDarkMode ? 'border-[#1E253D]' : 'border-gray-200'}`}>전력</th>
                    <th className={`w-[13%] px-3 border-b border-r font-semibold text-center align-middle uppercase ${isDarkMode ? 'border-[#1E253D]' : 'border-gray-200'}`}>임계값(온도)</th>
                    <th className={`w-[10%] px-3 border-b font-semibold text-center align-middle uppercase ${isDarkMode ? 'border-[#1E253D]' : 'border-gray-200'}`}>상태</th>
                  </tr>
                </thead>
                <tbody className={`divide-y text-[13px] sm:text-sm ${
                  isDarkMode ? 'divide-[#1A2036] text-[#B9C2DE]' : 'divide-gray-100 text-gray-600'
                }`}>
                  {/* 신규 설비 인라인 입력 행 (장비추가 클릭 시 맨 위에 생성, 저장 시 함께 등록) */}
                  {newRows.map((row) => {
                    const inputClass = `w-full h-[30px] rounded px-1.5 text-xs text-center border outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                      isDarkMode ? 'bg-[#0D1224] border-[#2A335A] text-[#EDF1FC] focus:border-[#22D3EE]' : 'bg-white border-gray-300 text-gray-800 focus:border-green-600'
                    }`;
                    const cellBorder = isDarkMode ? 'border-[#1A2036]' : 'border-gray-100';

                    return (
                      <tr
                        key={row.tempId}
                        className={`h-[52px] max-h-[52px] border-l-2 ${
                          isDarkMode ? 'bg-[#151B30] border-l-[#22D3EE]' : 'bg-green-50/70 border-l-green-600'
                        }`}
                      >
                        <td className={`px-3 py-0 h-[52px] align-middle border-r ${cellBorder}`}>
                          <input
                            type="text"
                            value={row.equipId}
                            readOnly
                            title="ID는 자동으로 부여됩니다"
                            className={`${inputClass} cursor-not-allowed opacity-70`}
                          />
                        </td>
                        <td className={`px-3 py-0 h-[52px] align-middle border-r ${cellBorder}`}>
                          <input type="text" value={row.equipName} onChange={(e) => handleNewRowChange(row.tempId, 'equipName', e.target.value)} placeholder="설비명" className={inputClass} />
                        </td>
                        <td className={`px-3 py-0 h-[52px] align-middle border-r ${cellBorder}`}>
                          <input type="text" value={row.location} onChange={(e) => handleNewRowChange(row.tempId, 'location', e.target.value)} placeholder="위치" className={inputClass} />
                        </td>
                        <td className={`px-3 py-0 h-[52px] font-mono text-xs text-center truncate align-middle border-r ${cellBorder} ${isDarkMode ? 'text-[#7D87A8]' : 'text-gray-400'}`}>
                          -
                        </td>
                        <td className={`px-3 py-0 h-[52px] align-middle border-r ${cellBorder}`}>
                          <input type="number" value={row.temperature} onChange={(e) => handleNewRowChange(row.tempId, 'temperature', e.target.value)} placeholder="온도" className={inputClass} />
                        </td>
                        <td className={`px-3 py-0 h-[52px] align-middle border-r ${cellBorder}`}>
                          <input type="number" value={row.power} onChange={(e) => handleNewRowChange(row.tempId, 'power', e.target.value)} placeholder="전력" className={inputClass} />
                        </td>
                        <td className={`px-3 py-0 h-[52px] align-middle border-r ${cellBorder}`}>
                          <input type="number" value={row.threshold} onChange={(e) => handleNewRowChange(row.tempId, 'threshold', e.target.value)} placeholder="임계값" className={inputClass} />
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
                        {isConnected ? '웹소켓 수신 대기 중...' : '웹소켓 연결을 확인해 주세요.'}
                      </td>
                    </tr>
                  )}
                  {equipments.length > 0 && filteredEquipments.length === 0 && (
                    <tr>
                      <td colSpan={8} className={`px-3.5 py-10 text-center ${isDarkMode ? 'text-[#7D87A8]' : 'text-gray-400'}`}>
                        '{equipSearch}'에 대한 검색 결과가 없습니다.
                      </td>
                    </tr>
                  )}
                  {filteredEquipments.map((eq, idx) => {
                    const statusMeta = getStatusMeta(eq.status);
                    const statusStyle = STATUS_STYLES[statusMeta.color][isDarkMode ? 'dark' : 'light'];
                    const isSelected = selectedEquipId === eq.equipId;
                    const isFlashed = flashedIds.has(eq.equipId);
                    const cellBorder = isDarkMode ? 'border-[#1A2036]' : 'border-gray-100';

                    const isClickHighlighted = clickHighlightId === eq.equipId;
                    const isDanger = statusMeta.color === 'red';
                    const isWarning = statusMeta.color === 'amber';

                    return (
                      <tr
                        key={`${eq.equipId}-${idx}`}
                        id={`equip-row-${eq.equipId}`}
                        onClick={() => {
                          setSelectedEquipId(isSelected ? null : eq.equipId);
                          setHistoryEquipId(eq.equipId);
                          setHistoryMetric(null);
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
                        <td className={`px-3 py-0 h-[52px] font-mono text-center truncate align-middle border-r ${cellBorder} ${isDarkMode ? 'text-[#7D87A8]' : 'text-gray-400'}`}>
                          #{String(eq.equipId).padStart(3, '0')}
                        </td>
                        <td className={`px-3 py-0 h-[52px] text-center align-middle border-r ${cellBorder}`}>
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
                            <span className={`font-bold truncate ${
                              isSelected ? (isDarkMode ? 'text-[#22D3EE]' : 'text-green-700') : (isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-800')
                            }`}>
                              {eq.equipName}
                            </span>
                          )}
                        </td>
                        <td className={`px-3 py-0 h-[52px] text-center align-middle border-r ${cellBorder}`}>
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
                        </td>
                        <td className={`px-3 py-0 h-[52px] font-mono text-xs text-center truncate align-middle border-r ${cellBorder} ${isDarkMode ? 'text-[#7D87A8]' : 'text-gray-500'}`}>
                          {eq.receivedAt ? new Date(eq.receivedAt).toLocaleTimeString('ko-KR') : '-'}
                        </td>
                        <td className={`px-3 py-0 h-[52px] text-center align-middle border-r ${cellBorder}`}>
                          <span className={`font-mono font-bold tabular-nums ${
                            statusMeta.color === 'green' ? (isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-800') : statusStyle.text
                          }`}>
                            {eq.temperature != null ? `${Number(eq.temperature).toFixed(1)}℃` : '–'}
                          </span>
                        </td>
                        <td className={`px-3 py-0 h-[52px] text-center align-middle border-r ${cellBorder}`}>
                          <span className={`font-mono font-bold tabular-nums ${
                            isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-800'
                          }`}>
                            {eq.power != null ? Number(eq.power).toFixed(1) : '–'}
                          </span>
                        </td>
                        <td className={`px-3 py-0 h-[52px] font-mono align-middle border-r ${cellBorder}`}>
                          <div className="flex items-center justify-center h-full">
                            {tabMode === 'threshold' ? (
                              <input
                                type="number"
                                value={editedFields[eq.equipId]?.threshold !== undefined ? editedFields[eq.equipId].threshold : (eq.threshold ?? '')}
                                onChange={(e) => handleFieldChange(eq.equipId, 'threshold', e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                className={`w-[70px] h-[30px] rounded px-1.5 focus:outline-none text-center border text-xs leading-none transition-all shrink-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                                  isDarkMode ? 'bg-[#0D1224] border-[#2A335A] text-[#EDF1FC] focus:border-[#22D3EE]' : 'bg-white border-gray-300 text-gray-800 focus:border-green-600'
                                }`}
                              />
                            ) : (
                              <span className={`inline-flex items-center justify-center w-[70px] h-[30px] text-xs shrink-0 ${
                                isDarkMode ? 'text-[#7D87A8]' : 'text-gray-500'
                              }`}>
                                {eq.threshold ?? '–'}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-0 h-[52px] text-center align-middle">
                          <span className={`inline-flex items-center gap-1 text-xs font-bold whitespace-nowrap ${statusStyle.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
                            {statusMeta.label}
                          </span>
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