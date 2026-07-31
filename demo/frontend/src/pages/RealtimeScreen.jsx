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
    
    // 단일 객체이거나 배열인 경우 모두 처리
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

const clearDB = async () => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
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

  const stompClientRef = useRef(null);

  // 1. 웹소켓(WebSocket) 연결 및 /topic/live/monitoring 구독
  useEffect(() => {
    const setupWebSocket = async () => {
      // 페이지 진입 시 IndexedDB 초기화
      await clearDB();
      setAccumulatedCount(0);

      // STOMP 클라이언트 생성
      const client = new Client({
      webSocketFactory: () => new SockJS('http://localhost:8086/ws'),

      connectHeaders: {
        Authorization: user?.token ? `Bearer ${user.token}` : '',
        token: user?.token || '',
      },
      debug: (str) => {
        console.log('[STOMP]', str);
      },
      reconnectDelay: 5000, // 연결 끊길 시 5초 후 재연결
      
      onConnect: () => {
        setIsConnected(true);
        setLoadError('');

        // 웹소켓 메시지 수신 구독
        client.subscribe('/topic/live/monitoring', async (message) => {
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
              setTimeout(() => setFlash(false), 500);

              await saveToDB(newDataList);
              setAccumulatedCount(prev => prev + newDataList.length);
            }
          } catch (e) {
            console.error('웹소켓 데이터 파싱 에러:', e);
          }
        });
      },

      onStompError: (frame) => {
        console.error('STOMP 에러:', frame.headers['message']);
        setLoadError('STOMP 프로토콜 오류');
        setIsConnected(false);
      },

      onWebSocketClose: () => {
        setIsConnected(false);
      }
    });

      client.activate();
      stompClientRef.current = client;
    };

    setupWebSocket();

    // 언마운트 시 소켓 연결 해제
    return () => {
      if (stompClientRef.current) {
        stompClientRef.current.deactivate();
      }
    };
  }, [user]);

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

  // 엑셀 내보내기 (IndexedDB 전체 누적 데이터)
  const handleExport = async () => {
    try {
      const accumulatedData = await getAllFromDB();

      if (!accumulatedData || accumulatedData.length === 0) {
        alert('내보낼 누적 데이터가 없습니다.');
        return;
      }

      const exportData = accumulatedData.map(eq => {
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
      XLSX.utils.book_append_sheet(workbook, worksheet, '실시간_소켓_누적데이터');

      const today = new Date();
      const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
      const timeStr = today.toTimeString().slice(0, 5).replace(':', '');
      const fileName = `설비모니터링_소켓누적_${dateStr}_${timeStr}.xlsx`;

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

  const handleSaveThresholds = async () => {
    const payload = Object.entries(editedThresholds).map(([equipId, threshold]) => ({
      equipId: Number(equipId),
      threshold: threshold === '' ? null : Number(threshold)
    }));

    try {
      await axios.put(
        'http://localhost:8086/api/live/monitoring/thresholds',
        payload,
        {
          headers: user?.token ? { Authorization: `Bearer ${user.token}` } : {},
        }
      );

      setEquipments(prev =>
        prev.map(eq => {
          const updated = payload.find(p => p.equipId === eq.equipId);
          return updated ? { ...eq, threshold: updated.threshold } : eq;
        })
      );

      alert('DB에 임계값이 저장되었습니다.');
      setTabMode('stream');
    } catch (err) {
      console.error('DB 저장 실패:', err);
      alert('DB 저장 중 오류 발생');
    }
  };

  const selectedEquipName = equipments.find(e => e.equipId === selectedEquipId)?.equipName;
  const displayedAlarms = selectedEquipName
    ? alarms.filter(alarm => alarm.equipName === selectedEquipName)
    : alarms;

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
        <div className={`flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl shrink-0 border transition-colors ${
          isDarkMode ? 'bg-[#12172A] border-[#1E253D]' : 'bg-white border-gray-200 shadow-sm'
        }`}>
          
          <div className={`relative flex items-center p-1 rounded-full border w-[260px] sm:w-[280px] shrink-0 transition-colors ${
            isDarkMode ? 'bg-[#0D1224] border-[#232B45]' : 'bg-gray-100 border-gray-200'
          }`}>
            <div
              className={`absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-full transition-transform duration-300 ease-out border ${
                isDarkMode ? 'bg-[#1E2A4A] border-[#22D3EE]/40' : 'bg-white border-gray-300 shadow-sm'
              } ${tabMode === 'threshold' ? 'translate-x-full' : 'translate-x-0'}`}
            />
            <button
              onClick={() => setTabMode('stream')}
              className={`relative z-10 w-1/2 py-1.5 sm:py-2 text-center rounded-full text-xs sm:text-[13px] font-bold tracking-wide transition-colors ${
                tabMode === 'stream' 
                  ? (isDarkMode ? 'text-[#22D3EE]' : 'text-green-700') 
                  : (isDarkMode ? 'text-[#5C6584] hover:text-[#A2ACC9]' : 'text-gray-500 hover:text-gray-800')
              }`}
            >
              실시간 스트림
            </button>
            <button
              onClick={() => setTabMode('threshold')}
              className={`relative z-10 w-1/2 py-1.5 sm:py-2 text-center rounded-full text-xs sm:text-[13px] font-bold tracking-wide transition-colors ${
                tabMode === 'threshold' 
                  ? (isDarkMode ? 'text-[#22D3EE]' : 'text-green-700') 
                  : (isDarkMode ? 'text-[#5C6584] hover:text-[#A2ACC9]' : 'text-gray-500 hover:text-gray-800')
              }`}
            >
              임계값설정
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 sm:gap-2.5 w-full sm:w-auto">
            <div className={`flex items-center gap-2 mr-2 text-xs font-bold ${isDarkMode ? 'text-[#5C6584]' : 'text-gray-500'}`}>
              <span className="relative flex h-2 w-2">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${flash ? 'bg-blue-500' : 'bg-transparent'}`}></span>
                <span className={`relative inline-flex rounded-full h-2 w-2 ${flash ? 'bg-blue-500' : 'bg-gray-400'}`}></span>
              </span>
              DB 누적 수신량: <span className={isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-800'}>{accumulatedCount.toLocaleString()}건</span>
            </div>

            <button
              onClick={handleExport}
              className={`px-3 sm:px-4 py-1.5 sm:py-2 border rounded-lg text-xs sm:text-[13px] font-semibold transition-colors flex items-center gap-1.5 ${
                isDarkMode ? 'border-[#232B45] hover:border-[#2A335A] hover:bg-[#151B30] text-[#8592AD] hover:text-[#EDF1FC]' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-100 text-gray-600 hover:text-gray-900'
              }`}
            >
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path>
              </svg>
              전체 누적데이터 내보내기
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
                  {equipments.map((eq, idx) => {
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
    </div>
  );
};

export default RealtimeScreen;