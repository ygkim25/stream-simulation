import React, { useState } from 'react';
import Header from '../components/Header';
import AlarmSidebar from '../components/AlarmSidebar';

// ==========================================
// 실시간 모니터링 화면 컴포넌트 (반응형 + 다크 / 라이트 모드)
// ==========================================

const RealtimeScreen = ({ 
  user, 
  setRoute, 
  openMyPage, 
  equipments = [], 
  alarms = [], 
  setAlarms, 
  openLogs, 
  isDarkMode, 
  setIsDarkMode 
}) => {
  const [tabMode, setTabMode] = useState('stream');
  const [time, setTime] = useState(() => new Date());
  const [initialTime] = useState(() => new Date());
  const [selectedEquipId, setSelectedEquipId] = useState(null);

  const adjustTime = (minutes) => {
    setTime(prev => new Date(prev.getTime() + minutes * 60000));
  };

  const resetTime = () => {
    setTime(initialTime);
  };

  const handleExport = () => {
    alert('현재 그리드 데이터를 엑셀 파일로 다운로드합니다.');
  };

  const selectedEquipName = equipments.find(e => (e.equipId ?? e.id) === selectedEquipId)?.equipName;

  const displayedAlarms = selectedEquipName
    ? alarms.filter(alarm => alarm.equipName === selectedEquipName)
    : alarms;

  return (
    /* 
      [반응형 핵심 1]
      - 모바일/태블릿 (< lg): min-h-screen, overflow-y-auto (전체 페이지 스크롤)
      - 데스크톱 (>= lg): h-screen, max-h-[1080px], overflow-hidden (1080p 대시보드 고정)
    */
    <div className={`w-full min-w-[320px] flex flex-col transition-colors min-h-screen lg:h-screen lg:max-h-[1080px] lg:overflow-hidden ${
      isDarkMode ? 'bg-[#0A0E1A]' : 'bg-gray-50'
    }`}>
      {/* 상단 헤더 */}
      <Header 
        title="실시간 모니터링" 
        user={user} 
        setRoute={setRoute} 
        openMyPage={openMyPage} 
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
      />

      {/* 메인 컨테이너 패널 */}
      <div className="flex-1 p-3 sm:p-4 md:p-6 flex flex-col gap-4 max-w-[1920px] mx-auto w-full lg:overflow-hidden lg:h-full">

        {/* 상단 컨트롤 영역 (반응형 정렬) */}
        <div className={`flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl shrink-0 border transition-colors ${
          isDarkMode 
            ? 'bg-[#12172A] border-[#1E253D]' 
            : 'bg-white border-gray-200 shadow-sm'
        }`}>

          {/* 세그먼트 토글 */}
          <div className={`relative flex items-center p-1 rounded-full border w-[260px] sm:w-[280px] shrink-0 transition-colors ${
            isDarkMode ? 'bg-[#0D1224] border-[#232B45]' : 'bg-gray-100 border-gray-200'
          }`}>
            {/* 슬라이딩 인디케이터 (left-1 고정 및 translate-x-full 적용) */}
            <div
              className={`absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-full transition-transform duration-300 ease-out border ${
                isDarkMode 
                  ? 'bg-[#1E2A4A] border-[#22D3EE]/40' 
                  : 'bg-white border-gray-300 shadow-sm'
              } ${
                tabMode === 'threshold' ? 'translate-x-full' : 'translate-x-0'
              }`}
            />

            {/* 버튼 1 : w-1/2 로 균등 배분 */}
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

            {/* 버튼 2 : w-1/2 로 균등 배분 */}
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

          {/* 시간 콘솔 및 기능 버튼 그룹 */}
          <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 sm:gap-2.5 w-full sm:w-auto">
            {/* 시간 조절 콘솔 */}
            <div className={`flex items-center rounded-lg overflow-hidden border transition-colors ${
              isDarkMode ? 'bg-[#0D1224] border-[#232B45]' : 'bg-gray-50 border-gray-200'
            }`}>
              <button
                onClick={() => adjustTime(-10)}
                className={`w-8 h-8 flex items-center justify-center font-bold text-base transition-colors ${
                  isDarkMode 
                    ? 'text-[#8592AD] hover:text-[#22D3EE] hover:bg-[#151B30]' 
                    : 'text-gray-600 hover:text-green-700 hover:bg-gray-200'
                }`}
              >
                −
              </button>
              <div className={`px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm font-mono font-bold tabular-nums border-x min-w-[76px] sm:min-w-[84px] text-center ${
                isDarkMode 
                  ? 'text-[#EDF1FC] border-[#232B45]' 
                  : 'text-gray-800 border-gray-200'
              }`}>
                {time.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
              </div>
              <button
                onClick={() => adjustTime(10)}
                className={`w-8 h-8 flex items-center justify-center font-bold text-base transition-colors ${
                  isDarkMode 
                    ? 'text-[#8592AD] hover:text-[#22D3EE] hover:bg-[#151B30]' 
                    : 'text-gray-600 hover:text-green-700 hover:bg-gray-200'
                }`}
              >
                +
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={resetTime}
                className={`px-3 sm:px-4 py-1.5 sm:py-2 border rounded-lg text-xs sm:text-[13px] font-semibold transition-colors ${
                  isDarkMode 
                    ? 'border-[#232B45] hover:border-[#2A335A] hover:bg-[#151B30] text-[#8592AD] hover:text-[#EDF1FC]' 
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-100 text-gray-600 hover:text-gray-900'
                }`}
              >
                초기화
              </button>

              <button
                onClick={handleExport}
                className={`px-3 sm:px-4 py-1.5 sm:py-2 border rounded-lg text-xs sm:text-[13px] font-semibold transition-colors flex items-center gap-1.5 ${
                  isDarkMode 
                    ? 'border-[#232B45] hover:border-[#2A335A] hover:bg-[#151B30] text-[#8592AD] hover:text-[#EDF1FC]' 
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-100 text-gray-600 hover:text-gray-900'
                }`}
              >
                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
                내보내기
              </button>
            </div>
          </div>
        </div>

        {/* 메인 컨테이너 영역 (lg 이상에서 flex-row) */}
        <div className="flex-1 flex flex-col lg:flex-row gap-4 min-h-0 items-stretch lg:overflow-hidden">

          {/* 왼쪽 Grid/Table 패널 (min-w-0 추가로 사이드바 밀림 방지) */}
          <div className={`flex-1 min-w-0 rounded-xl p-3.5 sm:p-5 flex flex-col border transition-colors min-h-[450px] lg:min-h-0 lg:overflow-hidden ${
            isDarkMode 
              ? 'bg-[#12172A] border-[#1E253D]' 
              : 'bg-white border-gray-200 shadow-sm'
          }`}>
            {/* 패널 타이틀 바 */}
            <div className={`flex flex-wrap items-center justify-between gap-2 mb-3 sm:mb-4 pb-3 border-b shrink-0 min-h-[36px] ${
              isDarkMode ? 'border-[#1E253D]' : 'border-gray-200'
            }`}>
              <div className="flex items-center gap-2.5 h-8">
                <h3 className={`font-bold text-sm sm:text-[15px] tracking-tight ${
                  isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-800'
                }`}>
                  {tabMode === 'stream' ? '설비별 실시간 수치 모니터링' : '설비 임계값 설정'}
                </h3>
                {selectedEquipId && (
                  <span className={`hidden sm:inline-block text-[11px] px-2 py-0.5 rounded font-semibold ${
                    isDarkMode 
                      ? 'bg-[#22D3EE]/10 text-[#22D3EE]' 
                      : 'bg-green-50 text-green-700 border border-green-200'
                  }`}>
                    선택 해제 클릭 가능
                  </span>
                )}
              </div>

              {/* [핵심] h-8 고정으로 저장 버튼 유무와 상관없이 높이 유지 */}
              <div className="flex items-center gap-3 h-8">
                <span className={`flex items-center gap-1.5 text-[11px] font-mono ${
                  isDarkMode ? 'text-[#5C6584]' : 'text-gray-500'
                }`}>
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#34D399] opacity-60"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#34D399]"></span>
                  </span>
                  LIVE ({equipments.length})
                </span>
                {tabMode === 'threshold' && (
                  <button
                    onClick={() => { alert('저장되었습니다.'); setTabMode('stream'); }}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors h-7 flex items-center justify-center ${
                      isDarkMode 
                        ? 'bg-[#22D3EE] hover:bg-[#3FDCF0] text-[#0A0E1A]' 
                        : 'bg-green-600 hover:bg-green-700 text-white'
                    }`}
                  >
                    저장
                  </button>
                )}
              </div>
            </div>

            {/* 테이블 가로/세로 스크롤 영역 */}
            <div className="flex-1 overflow-x-auto overflow-y-auto min-h-0">
              <table className="w-full text-left border-collapse table-fixed min-w-[700px] sm:min-w-[800px]">
                <thead className={`sticky top-0 text-[11px] z-10 transition-colors ${
                  isDarkMode ? 'bg-[#0D1224] text-[#5C6584]' : 'bg-gray-50 text-gray-500'
                }`}>
                  <tr className="h-[40px]">
                    <th className={`w-[11%] px-3 border-b font-semibold align-middle uppercase ${isDarkMode ? 'border-[#1E253D]' : 'border-gray-200'}`}>ID</th>
                    <th className={`w-[18%] px-3 border-b font-semibold align-middle uppercase ${isDarkMode ? 'border-[#1E253D]' : 'border-gray-200'}`}>설비명</th>
                    <th className={`w-[23%] px-3 border-b font-semibold align-middle uppercase ${isDarkMode ? 'border-[#1E253D]' : 'border-gray-200'}`}>위치 / 담당팀</th>
                    <th className={`w-[13%] px-3 border-b font-semibold align-middle uppercase ${isDarkMode ? 'border-[#1E253D]' : 'border-gray-200'}`}>온도</th>
                    <th className={`w-[13%] px-3 border-b font-semibold align-middle uppercase ${isDarkMode ? 'border-[#1E253D]' : 'border-gray-200'}`}>전력/진동</th>
                    <th className={`w-[12%] px-3 border-b font-semibold align-middle uppercase ${isDarkMode ? 'border-[#1E253D]' : 'border-gray-200'}`}>임계값</th>
                    <th className={`w-[10%] px-3 border-b font-semibold text-center align-middle uppercase ${isDarkMode ? 'border-[#1E253D]' : 'border-gray-200'}`}>상태</th>
                  </tr>
                </thead>
                <tbody className={`divide-y text-xs sm:text-[13px] ${
                  isDarkMode ? 'divide-[#1A2036] text-[#A2ACC9]' : 'divide-gray-100 text-gray-600'
                }`}>
                  {equipments.length === 0 && (
                    <tr>
                      <td colSpan={7} className={`px-3.5 py-10 text-center ${isDarkMode ? 'text-[#5C6584]' : 'text-gray-400'}`}>
                        표시할 설비 데이터가 없습니다.
                      </td>
                    </tr>
                  )}
                  {equipments.map((eq) => {
                    const eqId = eq.equipId ?? eq.id;
                    const temp = eq.temperature ?? eq.temp;
                    const power = eq.power ?? eq.vibration ?? eq.pressure;
                    const threshold = eq.threshold ?? 60;

                    const tempOver = threshold != null && temp != null && temp > threshold;
                    const powerOver = threshold != null && power != null && power > threshold;
                    const isOver = tempOver || powerOver || eq.status === 'WARNING' || eq.status === 'STOP';
                    const isSelected = selectedEquipId === eqId;

                    return (
                      <tr
                        key={eqId}
                        onClick={() => setSelectedEquipId(isSelected ? null : eqId)}
                        className={`h-[52px] max-h-[52px] transition-colors cursor-pointer border-l-2 ${
                          isSelected
                            ? (isDarkMode ? 'bg-[#151B30] border-l-[#22D3EE]' : 'bg-green-50/70 border-l-green-600')
                            : (isDarkMode ? 'hover:bg-[#0F1526] border-l-transparent' : 'hover:bg-gray-50 border-l-transparent')
                        }`}
                      >
                        <td className={`px-3 py-0 h-[52px] font-mono truncate align-middle ${isDarkMode ? 'text-[#5C6584]' : 'text-gray-400'}`}>
                          #{String(eqId).padStart(3, '0')}
                        </td>
                        <td className={`px-3 py-0 h-[52px] font-bold truncate align-middle ${
                          isSelected 
                            ? (isDarkMode ? 'text-[#22D3EE]' : 'text-green-700') 
                            : (isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-800')
                        }`}>
                          {eq.equipName}
                        </td>
                        <td className={`px-3 py-0 h-[52px] truncate align-middle ${isDarkMode ? 'text-[#5C6584]' : 'text-gray-500'}`}>
                          {eq.location}
                        </td>
                        <td className="px-3 py-0 h-[52px] align-middle">
                          <span className={`font-mono font-bold tabular-nums ${
                            tempOver 
                              ? (isDarkMode ? 'text-[#FB5D75]' : 'text-red-600') 
                              : (isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-800')
                          }`}>
                            {temp != null ? `${Number(temp).toFixed(1)}℃` : '–'}
                          </span>
                        </td>
                        <td className="px-3 py-0 h-[52px] align-middle">
                          <span className={`font-mono font-bold tabular-nums ${
                            powerOver 
                              ? (isDarkMode ? 'text-[#FB5D75]' : 'text-red-600') 
                              : (isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-800')
                          }`}>
                            {power != null ? Number(power).toFixed(1) : '–'}
                          </span>
                        </td>

                        {/* 임계값 셀 (py-0, h-[52px] 고정 및 input 화살표 스피너 제거) */}
                        <td className="px-3 py-0 h-[52px] font-mono align-middle">
                          <div className="flex items-center h-full">
                            {tabMode === 'threshold' ? (
                              <input
                                type="number"
                                defaultValue={threshold ?? ''}
                                onClick={(e) => e.stopPropagation()}
                                className={`w-[70px] h-[30px] rounded px-1.5 focus:outline-none text-center border text-xs leading-none transition-all shrink-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                                  isDarkMode 
                                    ? 'bg-[#0D1224] border-[#2A335A] text-[#EDF1FC] focus:border-[#22D3EE]' 
                                    : 'bg-white border-gray-300 text-gray-800 focus:border-green-600'
                                }`}
                              />
                            ) : (
                              <span className={`inline-flex items-center justify-center w-[70px] h-[30px] text-xs shrink-0 ${
                                isDarkMode ? 'text-[#5C6584]' : 'text-gray-500'
                              }`}>
                                {threshold ?? '–'}
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="px-3 py-0 h-[52px] text-center align-middle">
                          <span className={`inline-flex items-center gap-1 text-xs font-bold whitespace-nowrap ${
                            isOver 
                              ? (isDarkMode ? 'text-[#FB5D75]' : 'text-red-600') 
                              : (isDarkMode ? 'text-[#34D399]' : 'text-green-600')
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              isOver 
                                ? (isDarkMode ? 'bg-[#FB5D75]' : 'bg-red-600') 
                                : (isDarkMode ? 'bg-[#34D399]' : 'bg-green-600')
                            }`} />
                            {isOver ? '초과' : '정상'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 우측 알람 사이드바 */}
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