import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import SockJS from 'sockjs-client';
import { Client } from '@stomp/stompjs';
import Header from '../components/Header';
import AlarmSidebar from '../components/AlarmSidebar';

// ==========================================
// IndexedDB 유틸리티 (브라우저 로컬 DB 설정)
// ==========================================
const DB_NAME = 'MonitoringDB';
const STORE_NAME = 'liveData';

const initDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const saveToDB = async (dataArray) => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    
    const list = Array.isArray(dataArray) ? dataArray : [dataArray];
    list.forEach(item => store.put(item));
    
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

const getAllFromDB = async () => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

// 24시간이 지난 누적 데이터 자동 삭제 (receivedAt 기준). 삭제된 건수를 반환.
const DATA_RETENTION_MS = 24 * 60 * 60 * 1000;

const pruneOldData = async (maxAgeMs = DATA_RETENTION_MS) => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const cutoff = Date.now() - maxAgeMs;
    let deletedCount = 0;

    const cursorRequest = store.openCursor();
    cursorRequest.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        const item = cursor.value;
        if (item.receivedAt && new Date(item.receivedAt).getTime() < cutoff) {
          cursor.delete();
          deletedCount++;
        }
        cursor.continue();
      }
    };
    cursorRequest.onerror = () => reject(cursorRequest.error);

    tx.oncomplete = () => resolve(deletedCount);
    tx.onerror = () => reject(tx.error);
  });
};

// datetime-local input 포맷 변환 (YYYY-MM-DDTHH:mm)
const formatForDateTimeInput = (date) => {
  if (!date || isNaN(date.getTime())) return '';
  const tzoffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzoffset).toISOString().slice(0, 16);
};

// ==========================================
// 실시간 모니터링 화면 컴포넌트
// ==========================================
const RealtimeScreen = ({ 
  user, 
  setRoute, 
  openMyPage, 
  alarms = [], 
  setAlarms, 
  openLogs, 
  isDarkMode, 
  setIsDarkMode 
}) => {
  const [tabMode, setTabMode] = useState('stream');
  const [selectedEquipId, setSelectedEquipId] = useState(null);

  const [equipments, setEquipments] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [editedThresholds, setEditedThresholds] = useState({});
  
  // 누적 데이터 카운트 및 실시간 플래시 효과 State
  const [accumulatedCount, setAccumulatedCount] = useState(0);
  const [flash, setFlash] = useState(false);

  // 시작 시각 & 종료 시각 State (기본값: 1시간 전 ~ 현재)
  const [startTime, setStartTime] = useState(() => new Date(Date.now() - 60 * 60 * 1000));
  const [endTime, setEndTime] = useState(() => new Date());

  const stompClientRef = useRef(null);

  // ★ 웹소켓(WebSocket) 연결 및 중복 구독 방지 처리
  useEffect(() => {
    let isMounted = true;

    const setupWebSocket = async () => {
      // 24시간 지난 데이터만 정리하고, 나머지 누적 데이터는 새로고침/재진입에도 유지
      await pruneOldData();
      if (!isMounted) return;
      const existing = await getAllFromDB();
      if (isMounted) setAccumulatedCount(existing.length);

      // 기존 클라이언트가 살아있다면 해제 후 재연결
      if (stompClientRef.current) {
        stompClientRef.current.deactivate();
      }

      const client = new Client({
        webSocketFactory: () => new SockJS('http://localhost:8086/ws'),

        connectHeaders: {
          Authorization: user?.token ? `Bearer ${user.token}` : '',
          token: user?.token || '',
        },
        debug: (str) => {
          console.log('[STOMP]', str);
        },
        reconnectDelay: 5000,
        
        onConnect: () => {
          if (!isMounted) return;
          setIsConnected(true);
          setLoadError('');

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
                setEquipments(newDataList);

                setFlash(true);
                setTimeout(() => {
                  if (isMounted) setFlash(false);
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

    // 세션 유지 중에도 24시간 지난 데이터는 주기적으로 정리
    const pruneIntervalId = setInterval(async () => {
      const deleted = await pruneOldData();
      if (deleted > 0 && isMounted) {
        setAccumulatedCount(prev => Math.max(0, prev - deleted));
      }
    }, 10 * 60 * 1000); // 10분마다 점검

    return () => {
      isMounted = false;
      clearInterval(pruneIntervalId);
      if (stompClientRef.current) {
        stompClientRef.current.deactivate();
        stompClientRef.current = null;
      }
    };
  }, [user?.token]); // user 객체 대신 user?.token을 전달하여 불필요한 재연결 및 중복 구독 차단

  // 임계값 탭 이동 시 값 세팅
  useEffect(() => {
    if (tabMode === 'threshold') {
      const initialMap = {};
      equipments.forEach(eq => {
        initialMap[eq.equipId] = eq.threshold ?? '';
      });
      setEditedThresholds(initialMap);
    }
  }, [tabMode, equipments]);

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
  };

  // 시작 시간 변경 처리
  const handleStartTimeChange = (e) => {
    if (!e.target.value) return;
    const selectedStart = new Date(e.target.value);
    
    if (selectedStart > endTime) {
      alert('시작 시각은 종료 시각보다 나중일 수 없습니다.');
      return;
    }
    setStartTime(selectedStart);
  };

  // 종료 시간 변경 처리
  const handleEndTimeChange = (e) => {
    if (!e.target.value) return;
    const selectedEnd = new Date(e.target.value);
    
    if (selectedEnd < startTime) {
      alert('종료 시각은 시작 시각보다 빠를 수 없습니다.');
      return;
    }
    setEndTime(selectedEnd);
  };

  // 엑셀 내보내기 (선택한 자유 시간 범위 데이터 추출)
  const handleExport = async () => {
    if (startTime >= endTime) {
      alert('시작 시각은 종료 시각보다 빨라야 합니다.');
      return;
    }

    try {
      const accumulatedData = await getAllFromDB();

      if (!accumulatedData || accumulatedData.length === 0) {
        alert('내보낼 누적 데이터가 없습니다.');
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
        alert(`지정한 시간 구간 (${startStr} ~ ${endStr}) 내 수신 데이터가 없습니다.`);
        return;
      }

      const exportData = filteredData.map(eq => {
        const isTempOver = eq.threshold != null && eq.temperature != null && eq.temperature > eq.threshold;
        const isWarning = isTempOver || eq.status === 'WARNING' || eq.status === 'DANGER';

        return {
          'ID': `#${String(eq.equipId).padStart(3, '0')}`,
          '설비명': eq.equipName,
          '수신 시간': eq.receivedAt ? new Date(eq.receivedAt).toLocaleString('ko-KR') : '-',
          '온도(℃)': eq.temperature != null ? Number(eq.temperature).toFixed(1) : '-',
          '전력': eq.power != null ? Number(eq.power).toFixed(1) : '-',
          '임계값(온도)': eq.threshold ?? '-',
          '상태': isWarning ? '경고' : '정상'
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      worksheet['!cols'] = [
        { wch: 8 }, { wch: 15 }, { wch: 25 }, { wch: 10 }, { wch: 10 }, { wch: 15 }, { wch: 10 }
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
      alert('엑셀 파일 생성 실패');
    }
  };

  const handleThresholdChange = (equipId, value) => {
    setEditedThresholds(prev => ({
      ...prev,
      [equipId]: value === '' ? '' : Number(value)
    }));
  };

  // 설비 그리드만 최신 데이터로 다시 불러오기 (전체 새로고침 없이)
  const fetchEquipments = async () => {
    try {
      const response = await axios.get('http://localhost:8086/api/live/monitoring', {
        headers: user?.token ? { Authorization: `Bearer ${user.token}` } : {},
      });
      setEquipments(response.data || []);
    } catch (err) {
      console.error('설비 목록 갱신 실패:', err);
    }
  };

  const handleSaveThresholds = async () => {
    const payload = Object.entries(editedThresholds).map(([equipId, threshold]) => ({
      equipId,
      threshold: threshold === '' ? null : Number(threshold)
    }));

    try {
      await axios.put(
        'http://localhost:8086/api/live/monitoring/update',
        payload,
        {
          headers: user?.token ? { Authorization: `Bearer ${user.token}` } : {},
        }
      );

      await fetchEquipments();

      alert('DB에 임계값이 저장되었습니다.');
      setTabMode('stream');
    } catch (err) {
      console.error('DB 저장 실패:', err);
      alert('DB 저장 중 오류 발생');
    }
  };

  // 설비 추가 관련 State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newEquip, setNewEquip] = useState({ equipId: '', equipName: '', location: '', threshold: '' });

  const handleNewEquipChange = (field, value) => {
    setNewEquip(prev => ({ ...prev, [field]: value }));
  };

  // ★ 백엔드 연동 전 임시 처리: 화면(로컬 state)에만 반영, 서버 저장 없음
  const handleAddEquipment = () => {
    if (!newEquip.equipId.trim() || !newEquip.equipName.trim()) {
      alert('설비 ID와 설비명은 필수입니다.');
      return;
    }

    if (equipments.some(eq => eq.equipId === newEquip.equipId.trim())) {
      alert('이미 존재하는 설비 ID입니다.');
      return;
    }

    setEquipments(prev => [
      ...prev,
      {
        equipId: newEquip.equipId.trim(),
        equipName: newEquip.equipName.trim(),
        location: newEquip.location.trim() || null,
        threshold: newEquip.threshold === '' ? null : Number(newEquip.threshold),
        temperature: null,
        power: null,
        status: '정상',
        receivedAt: new Date().toISOString(),
      },
    ]);

    setIsAddModalOpen(false);
    setNewEquip({ equipId: '', equipName: '', location: '', threshold: '' });
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

  return (
    <div className={`w-full min-w-[320px] flex flex-col transition-colors min-h-screen lg:h-screen lg:max-h-[1080px] lg:overflow-hidden ${
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

      <div className="flex-1 p-3 sm:p-4 md:p-6 flex flex-col gap-4 max-w-[1920px] mx-auto w-full lg:overflow-hidden lg:h-full">
        {/* 상단 컨트롤 영역 */}
        <div className={`flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl shrink-0 border transition-colors ${
          isDarkMode ? 'bg-[#12172A] border-[#1E253D]' : 'bg-white border-gray-200 shadow-sm'
        }`}>
          
          <div className="flex flex-wrap items-center gap-3">
            {/* 탭 전환 스위치 */}
            <div className={`relative flex items-center p-1 rounded-full border w-[220px] shrink-0 transition-colors ${
              isDarkMode ? 'bg-[#0D1224] border-[#232B45]' : 'bg-gray-100 border-gray-200'
            }`}>
              <div
                className={`absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-full transition-transform duration-300 ease-out border ${
                  isDarkMode ? 'bg-[#1E2A4A] border-[#22D3EE]/40' : 'bg-white border-gray-300 shadow-sm'
                } ${tabMode === 'threshold' ? 'translate-x-full' : 'translate-x-0'}`}
              />
              <button
                onClick={() => setTabMode('stream')}
                className={`relative z-10 w-1/2 py-1.5 text-center rounded-full text-xs font-bold tracking-wide transition-colors ${
                  tabMode === 'stream' 
                    ? (isDarkMode ? 'text-[#22D3EE]' : 'text-green-700') 
                    : (isDarkMode ? 'text-[#5C6584] hover:text-[#A2ACC9]' : 'text-gray-500 hover:text-gray-800')
                }`}
              >
                실시간 스트림
              </button>
              <button
                onClick={() => setTabMode('threshold')}
                className={`relative z-10 w-1/2 py-1.5 text-center rounded-full text-xs font-bold tracking-wide transition-colors ${
                  tabMode === 'threshold' 
                    ? (isDarkMode ? 'text-[#22D3EE]' : 'text-green-700') 
                    : (isDarkMode ? 'text-[#5C6584] hover:text-[#A2ACC9]' : 'text-gray-500 hover:text-gray-800')
                }`}
              >
                임계값설정
              </button>
            </div>

            {/* 완전 자유로운 범위 선택 영역 */}
            <div className={`flex flex-wrap items-center gap-2 px-3 py-1.5 rounded-lg border text-xs ${
              isDarkMode ? 'bg-[#0D1224] border-[#232B45] text-[#A2ACC9]' : 'bg-gray-50 border-gray-200 text-gray-700'
            }`}>
              <span className="font-bold shrink-0">추출 범위:</span>

              <input
                type="datetime-local"
                max={formatForDateTimeInput(endTime)}
                value={formatForDateTimeInput(startTime)}
                onChange={handleStartTimeChange}
                style={{ colorScheme: isDarkMode ? 'dark' : 'light' }}
                className={`bg-transparent outline-none font-mono text-xs cursor-pointer ${
                  isDarkMode ? 'text-[#22D3EE]' : 'text-green-700 font-bold'
                }`}
              />
              <span>~</span>
              <input
                type="datetime-local"
                min={formatForDateTimeInput(startTime)}
                max={currentNowIso}
                value={formatForDateTimeInput(endTime)}
                onChange={handleEndTimeChange}
                style={{ colorScheme: isDarkMode ? 'dark' : 'light' }}
                className={`bg-transparent outline-none font-mono text-xs cursor-pointer ${
                  isDarkMode ? 'text-[#22D3EE]' : 'text-green-700 font-bold'
                }`}
              />

              {/* 퀵 슬롯 버튼 */}
              <div className="flex items-center gap-1 ml-1">
                <button
                  onClick={() => handlePresetRange('FULL_1HR')}
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold border transition-colors ${
                    isDarkMode ? 'bg-[#151B30] border-[#2A335A] hover:bg-[#1E2745] text-[#EDF1FC]' : 'bg-white border-gray-300 hover:bg-gray-100 text-gray-700'
                  }`}
                  title="최근 1시간 선택"
                >
                  최근 1시간
                </button>
                <button
                  onClick={() => handlePresetRange('FIRST_30M')}
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold border transition-colors ${
                    isDarkMode ? 'bg-[#151B30] border-[#2A335A] hover:bg-[#1E2745] text-[#EDF1FC]' : 'bg-white border-gray-300 hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  전반 30분
                </button>
                <button
                  onClick={() => handlePresetRange('LAST_30M')}
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold border transition-colors ${
                    isDarkMode ? 'bg-[#151B30] border-[#2A335A] hover:bg-[#1E2745] text-[#EDF1FC]' : 'bg-white border-gray-300 hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  후반 30분
                </button>
                <button
                  onClick={() => handlePresetRange('RESET_NOW')}
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold border transition-colors ${
                    isDarkMode
                      ? 'bg-[#1E2A4A] border-[#22D3EE]/50 text-[#22D3EE] hover:bg-[#25355E]'
                      : 'bg-green-50 border-green-300 text-green-700 hover:bg-green-100'
                  }`}
                  title="종료 시각을 현재 시각으로 설정"
                >
                  현재로 갱신
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between xl:justify-end gap-2 sm:gap-2.5 w-full xl:w-auto">
            <div className={`flex items-center gap-2 mr-2 text-xs font-bold ${isDarkMode ? 'text-[#5C6584]' : 'text-gray-500'}`}>
              <span className="relative flex h-2 w-2">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${flash ? 'bg-blue-500' : 'bg-transparent'}`}></span>
                <span className={`relative inline-flex rounded-full h-2 w-2 ${flash ? 'bg-blue-500' : 'bg-gray-400'}`}></span>
              </span>
              DB 수신량: <span className={isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-800'}>{accumulatedCount.toLocaleString()}건</span>
            </div>

            <button
              onClick={handleExport}
              className={`px-3 sm:px-4 py-1.5 sm:py-2 border rounded-lg text-xs sm:text-[13px] font-semibold transition-colors flex items-center gap-1.5 ${
                isDarkMode ? 'border-[#232B45] hover:border-[#2A335A] hover:bg-[#151B30] text-[#8592AD] hover:text-[#EDF1FC]' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-100 text-gray-600 hover:text-gray-900'
              }`}
            >
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="2" strokeLinejoin="round" />
                <line x1="3" y1="9.5" x2="21" y2="9.5" strokeWidth="2" strokeLinecap="round" />
                <line x1="3" y1="15" x2="21" y2="15" strokeWidth="2" strokeLinecap="round" />
                <line x1="9.5" y1="3" x2="9.5" y2="21" strokeWidth="2" strokeLinecap="round" />
              </svg>
              엑셀 내보내기
            </button>

            <button
              onClick={() => setIsAddModalOpen(true)}
              className={`px-3 sm:px-4 py-1.5 sm:py-2 border rounded-lg text-xs sm:text-[13px] font-semibold transition-colors flex items-center gap-1.5 ${
                isDarkMode ? 'bg-[#22D3EE] hover:bg-[#3FDCF0] border-[#22D3EE] text-[#0A0E1A]' : 'bg-green-700 hover:bg-green-800 border-green-700 text-white'
              }`}
            >
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path>
              </svg>
              장비추가
            </button>
          </div>
        </div>

        {/* 그리드 영역 */}
        <div className="flex-1 flex flex-col lg:flex-row gap-4 min-h-0 items-stretch lg:overflow-hidden">
          <div className={`flex-1 min-w-0 rounded-xl p-3.5 sm:p-5 flex flex-col border transition-colors min-h-[450px] lg:min-h-0 lg:overflow-hidden ${
            isDarkMode ? 'bg-[#12172A] border-[#1E253D]' : 'bg-white border-gray-200 shadow-sm'
          }`}>
            <div className={`flex flex-wrap items-center justify-between gap-2 mb-3 sm:mb-4 pb-3 border-b shrink-0 min-h-[36px] ${
              isDarkMode ? 'border-[#1E253D]' : 'border-gray-200'
            }`}>
              <div className="flex items-center gap-2.5 h-8">
                <h3 className={`font-bold text-sm sm:text-[15px] tracking-tight ${
                  isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-800'
                }`}>
                  {tabMode === 'stream' ? '실시간 소켓 웹 모니터링' : '설비 임계값 설정'}
                </h3>
              </div>

              <div className="flex items-center gap-3 h-8">
                <span className={`flex items-center gap-1.5 text-[11px] font-mono ${
                  isDarkMode ? 'text-[#5C6584]' : 'text-gray-500'
                }`}>
                  {isConnected ? (
                    <>
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#34D399] opacity-60"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#34D399]"></span>
                      </span>
                      <span className="text-[#34D399] font-bold">SOCKET LIVE ({equipments.length}대)</span>
                    </>
                  ) : loadError ? (
                    <span className="text-[#FB5D75]">{loadError}</span>
                  ) : (
                    <span className="text-amber-500">웹소켓 연결 중...</span>
                  )}
                </span>
                
                {tabMode === 'threshold' && (
                  <button
                    onClick={handleSaveThresholds}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors h-7 flex items-center justify-center ${
                      isDarkMode ? 'bg-[#22D3EE] hover:bg-[#3FDCF0] text-[#0A0E1A]' : 'bg-green-600 hover:bg-green-700 text-white'
                    }`}
                  >
                    저장
                  </button>
                )}
              </div>
            </div>

            {/* 그리드 표 */}
            <div className="flex-1 overflow-x-auto overflow-y-auto min-h-0 custom-scrollbar">
              <table className="w-full text-left border-collapse table-fixed min-w-[700px] sm:min-w-[800px]">
                <thead className={`sticky top-0 text-[11px] z-10 transition-colors ${
                  isDarkMode ? 'bg-[#0D1224] text-[#5C6584]' : 'bg-gray-50 text-gray-500'
                }`}>
                  <tr className="h-[40px]">
                    <th className={`w-[11%] px-3 border-b font-semibold align-middle uppercase ${isDarkMode ? 'border-[#1E253D]' : 'border-gray-200'}`}>ID</th>
                    <th className={`w-[18%] px-3 border-b font-semibold align-middle uppercase ${isDarkMode ? 'border-[#1E253D]' : 'border-gray-200'}`}>설비명</th>
                    <th className={`w-[23%] px-3 border-b font-semibold align-middle uppercase ${isDarkMode ? 'border-[#1E253D]' : 'border-gray-200'}`}>수신 시간</th>
                    <th className={`w-[13%] px-3 border-b font-semibold align-middle uppercase ${isDarkMode ? 'border-[#1E253D]' : 'border-gray-200'}`}>온도</th>
                    <th className={`w-[13%] px-3 border-b font-semibold align-middle uppercase ${isDarkMode ? 'border-[#1E253D]' : 'border-gray-200'}`}>전력</th>
                    <th className={`w-[12%] px-3 border-b font-semibold align-middle uppercase ${isDarkMode ? 'border-[#1E253D]' : 'border-gray-200'}`}>임계값(온도)</th>
                    <th className={`w-[10%] px-3 border-b font-semibold text-center align-middle uppercase ${isDarkMode ? 'border-[#1E253D]' : 'border-gray-200'}`}>상태</th>
                  </tr>
                </thead>
                <tbody className={`divide-y text-xs sm:text-[13px] transition-colors duration-300 ${
                  flash ? (isDarkMode ? 'bg-[#22D3EE]/10' : 'bg-green-50') : 'bg-transparent'
                } ${
                  isDarkMode ? 'divide-[#1A2036] text-[#A2ACC9]' : 'divide-gray-100 text-gray-600'
                }`}>
                  {equipments.length === 0 && (
                    <tr>
                      <td colSpan={7} className={`px-3.5 py-10 text-center ${isDarkMode ? 'text-[#5C6584]' : 'text-gray-400'}`}>
                        {isConnected ? '웹소켓 수신 대기 중...' : '웹소켓 연결을 확인해 주세요.'}
                      </td>
                    </tr>
                  )}
                  {sortedEquipments.map((eq, idx) => {
                    const isTempOver = eq.threshold != null && eq.temperature != null && eq.temperature > eq.threshold;
                    const isWarning = isTempOver || eq.status === 'WARNING' || eq.status === 'DANGER';
                    const isSelected = selectedEquipId === eq.equipId;

                    return (
                      <tr
                        key={`${eq.equipId}-${idx}`}
                        onClick={() => setSelectedEquipId(isSelected ? null : eq.equipId)}
                        className={`h-[52px] max-h-[52px] transition-colors cursor-pointer border-l-2 ${
                          isSelected
                            ? (isDarkMode ? 'bg-[#151B30] border-l-[#22D3EE]' : 'bg-green-50/70 border-l-green-600')
                            : (isDarkMode ? 'hover:bg-[#0F1526] border-l-transparent' : 'hover:bg-gray-50 border-l-transparent')
                        }`}
                      >
                        <td className={`px-3 py-0 h-[52px] font-mono truncate align-middle ${isDarkMode ? 'text-[#5C6584]' : 'text-gray-400'}`}>
                          #{String(eq.equipId).padStart(3, '0')}
                        </td>
                        <td className={`px-3 py-0 h-[52px] font-bold truncate align-middle ${
                          isSelected ? (isDarkMode ? 'text-[#22D3EE]' : 'text-green-700') : (isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-800')
                        }`}>
                          {eq.equipName}
                        </td>
                        <td className={`px-3 py-0 h-[52px] font-mono text-[11px] truncate align-middle ${isDarkMode ? 'text-[#5C6584]' : 'text-gray-500'}`}>
                          {eq.receivedAt ? new Date(eq.receivedAt).toLocaleTimeString('ko-KR') : '-'}
                        </td>
                        <td className="px-3 py-0 h-[52px] align-middle">
                          <span className={`font-mono font-bold tabular-nums ${
                            isTempOver ? (isDarkMode ? 'text-[#FB5D75]' : 'text-red-600') : (isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-800')
                          }`}>
                            {eq.temperature != null ? `${Number(eq.temperature).toFixed(1)}℃` : '–'}
                          </span>
                        </td>
                        <td className="px-3 py-0 h-[52px] align-middle">
                          <span className={`font-mono font-bold tabular-nums ${
                            isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-800'
                          }`}>
                            {eq.power != null ? Number(eq.power).toFixed(1) : '–'}
                          </span>
                        </td>
                        <td className="px-3 py-0 h-[52px] font-mono align-middle">
                          <div className="flex items-center h-full">
                            {tabMode === 'threshold' ? (
                              <input
                                type="number"
                                value={editedThresholds[eq.equipId] !== undefined ? editedThresholds[eq.equipId] : (eq.threshold ?? '')}
                                onChange={(e) => handleThresholdChange(eq.equipId, e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                className={`w-[70px] h-[30px] rounded px-1.5 focus:outline-none text-center border text-xs leading-none transition-all shrink-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                                  isDarkMode ? 'bg-[#0D1224] border-[#2A335A] text-[#EDF1FC] focus:border-[#22D3EE]' : 'bg-white border-gray-300 text-gray-800 focus:border-green-600'
                                }`}
                              />
                            ) : (
                              <span className={`inline-flex items-center justify-center w-[70px] h-[30px] text-xs shrink-0 ${
                                isDarkMode ? 'text-[#5C6584]' : 'text-gray-500'
                              }`}>
                                {eq.threshold ?? '–'}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-0 h-[52px] text-center align-middle">
                          <span className={`inline-flex items-center gap-1 text-xs font-bold whitespace-nowrap ${
                            isWarning ? (isDarkMode ? 'text-[#FB5D75]' : 'text-red-600') : (isDarkMode ? 'text-[#34D399]' : 'text-green-600')
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              isWarning ? (isDarkMode ? 'bg-[#FB5D75]' : 'bg-red-600') : (isDarkMode ? 'bg-[#34D399]' : 'bg-green-600')
                            }`} />
                            {isWarning ? '경고' : '정상'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 알람 사이드바 */}
          <div className="w-full lg:w-[340px] xl:w-[380px] shrink-0">
            <AlarmSidebar
              alarms={displayedAlarms}
              onClear={() => setAlarms([])}
              openLogs={openLogs}
              selectedEquipName={selectedEquipName}
              onClearFilter={() => setSelectedEquipId(null)}
              isDarkMode={isDarkMode}
            />
          </div>
        </div>
      </div>

      {/* 설비 추가 모달 */}
      {isAddModalOpen && (
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center p-4"
          style={{ backgroundColor: isDarkMode ? 'rgba(5, 8, 16, 0.75)' : 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(3px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setIsAddModalOpen(false); }}
        >
          <div className={`w-full max-w-[420px] rounded-2xl shadow-2xl border p-6 ${
            isDarkMode ? 'bg-[#12172A] border-[#232B45] text-[#EDF1FC]' : 'bg-white border-gray-200 text-gray-900'
          }`}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-[16px] font-bold">설비 추가</h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className={`text-2xl leading-none bg-transparent border-none cursor-pointer ${
                  isDarkMode ? 'text-[#5C6584] hover:text-[#EDF1FC]' : 'text-gray-400 hover:text-gray-800'
                }`}
              >
                &times;
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className={`block text-xs font-bold mb-1 ${isDarkMode ? 'text-[#5C6584]' : 'text-gray-500'}`}>설비 ID *</label>
                <input
                  type="text"
                  value={newEquip.equipId}
                  onChange={(e) => handleNewEquipChange('equipId', e.target.value)}
                  placeholder="예: EQ010"
                  className={`w-full rounded-xl px-3.5 py-2.5 text-sm outline-none border transition-colors ${
                    isDarkMode ? 'bg-[#0D1224] border-[#232B45] focus:border-[#22D3EE] text-[#EDF1FC] placeholder-[#5C6584]' : 'bg-gray-50 border-gray-200 focus:border-green-600 text-gray-800 placeholder-gray-400'
                  }`}
                />
              </div>
              <div>
                <label className={`block text-xs font-bold mb-1 ${isDarkMode ? 'text-[#5C6584]' : 'text-gray-500'}`}>설비명 *</label>
                <input
                  type="text"
                  value={newEquip.equipName}
                  onChange={(e) => handleNewEquipChange('equipName', e.target.value)}
                  placeholder="예: 압축기 E"
                  className={`w-full rounded-xl px-3.5 py-2.5 text-sm outline-none border transition-colors ${
                    isDarkMode ? 'bg-[#0D1224] border-[#232B45] focus:border-[#22D3EE] text-[#EDF1FC] placeholder-[#5C6584]' : 'bg-gray-50 border-gray-200 focus:border-green-600 text-gray-800 placeholder-gray-400'
                  }`}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block text-xs font-bold mb-1 ${isDarkMode ? 'text-[#5C6584]' : 'text-gray-500'}`}>위치</label>
                  <input
                    type="text"
                    value={newEquip.location}
                    onChange={(e) => handleNewEquipChange('location', e.target.value)}
                    placeholder="예: 3구역"
                    className={`w-full rounded-xl px-3.5 py-2.5 text-sm outline-none border transition-colors ${
                      isDarkMode ? 'bg-[#0D1224] border-[#232B45] focus:border-[#22D3EE] text-[#EDF1FC] placeholder-[#5C6584]' : 'bg-gray-50 border-gray-200 focus:border-green-600 text-gray-800 placeholder-gray-400'
                    }`}
                  />
                </div>
                <div>
                  <label className={`block text-xs font-bold mb-1 ${isDarkMode ? 'text-[#5C6584]' : 'text-gray-500'}`}>임계값(온도)</label>
                  <input
                    type="number"
                    value={newEquip.threshold}
                    onChange={(e) => handleNewEquipChange('threshold', e.target.value)}
                    placeholder="예: 100"
                    className={`w-full rounded-xl px-3.5 py-2.5 text-sm outline-none border transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                      isDarkMode ? 'bg-[#0D1224] border-[#232B45] focus:border-[#22D3EE] text-[#EDF1FC] placeholder-[#5C6584]' : 'bg-gray-50 border-gray-200 focus:border-green-600 text-gray-800 placeholder-gray-400'
                    }`}
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setIsAddModalOpen(false)}
                className={`flex-1 font-bold py-2.5 rounded-xl text-sm transition-colors ${
                  isDarkMode ? 'bg-[#1A223D] text-[#8592AD] hover:bg-[#232B45]' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                취소
              </button>
              <button
                onClick={handleAddEquipment}
                className={`flex-1 font-bold py-2.5 rounded-xl text-sm transition-colors ${
                  isDarkMode ? 'bg-[#22D3EE] hover:bg-[#3FDCF0] text-[#0A0E1A]' : 'bg-green-700 hover:bg-green-800 text-white'
                }`}
              >
                추가
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RealtimeScreen;