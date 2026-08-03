import React from 'react';

// ==========================================
// 우측 알람 패널 컴포넌트 (다크 / 라이트 모드 지원)
// ==========================================
const AlarmSidebar = ({ alarms, onClear, openLogs, selectedEquipName, onClearFilter, isDarkMode }) => {
  return (
    <div className={`w-full h-full rounded-xl flex flex-col overflow-hidden min-h-0 border transition-colors ${
      isDarkMode 
        ? 'bg-[#12172A] border-[#1E253D]' 
        : 'bg-white border-gray-200 shadow-sm'
    }`}>

      {/* 상단 알람 헤더 영역 */}
      <div className={`p-3.5 sm:p-4 border-b flex flex-col gap-3 shrink-0 transition-colors ${
        isDarkMode ? 'bg-[#0F1526] border-[#1E253D]' : 'bg-gray-50 border-gray-200'
      }`}>
        <div className="flex items-center justify-between gap-2">
          <div className={`font-bold text-[15px] flex items-center gap-2 tracking-tight shrink-0 ${
            isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-800'
          }`}>
            알람
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-mono font-bold ${
              isDarkMode 
                ? 'bg-[#FB5D75]/15 text-[#FB5D75]' 
                : 'bg-red-100 text-red-600 border border-red-200'
            }`}>
              {alarms.length}
            </span>
          </div>
          <div className="flex gap-1.5 shrink-0">
            <button
              onClick={onClear}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer border ${
                isDarkMode 
                  ? 'border-[#232B45] hover:border-[#2A335A] hover:bg-[#151B30] text-[#8592AD] hover:text-[#EDF1FC]' 
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-100 text-gray-600 hover:text-gray-900'
              }`}
            >
              전체 지우기
            </button>
            <button
              onClick={openLogs}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                isDarkMode 
                  ? 'bg-[#1A2036] hover:bg-[#232B45] text-[#A2ACC9]' 
                  : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
              }`}
            >
              전체 로그
            </button>
          </div>
        </div>

        {selectedEquipName && (
          <div className={`flex items-center justify-between border rounded-lg px-3 py-1.5 ${
            isDarkMode 
              ? 'bg-[#22D3EE]/10 border-[#22D3EE]/30' 
              : 'bg-green-50 border-green-200'
          }`}>
            <span className={`text-[11px] font-bold truncate ${isDarkMode ? 'text-[#22D3EE]' : 'text-green-700'}`}>
              ▸ {selectedEquipName} 알람만 표시 중
            </span>
            <button
              onClick={onClearFilter}
              className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors cursor-pointer border-none shrink-0 ml-2 ${
                isDarkMode 
                  ? 'text-[#22D3EE] hover:text-[#0A0E1A] bg-[#22D3EE]/15 hover:bg-[#22D3EE]' 
                  : 'text-green-700 hover:text-white bg-green-100 hover:bg-green-600'
              }`}
            >
              필터 해제 ✕
            </button>
          </div>
        )}
      </div>

      {/* 알람 카드 리스트 영역 */}
      <div className={`flex-1 overflow-y-auto p-3 space-y-2 transition-colors ${
        isDarkMode ? 'bg-[#0A0E1A]' : 'bg-gray-50/50'
      }`}>
        {alarms.length === 0 ? (
          <div className={`h-full flex flex-col items-center justify-center text-sm gap-2 ${
            isDarkMode ? 'text-[#5C6584]' : 'text-gray-400'
          }`}>
            <svg className={`w-10 h-10 ${isDarkMode ? 'text-[#232B45]' : 'text-gray-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path>
            </svg>
            <span>{selectedEquipName ? '해당 설비에 대한 발생 알람이 없습니다.' : '감지된 이상 알람이 없습니다.'}</span>
          </div>
        ) : (
          alarms.map(alarm => (
            <div 
              key={alarm.id} 
              /* [수정] 다크모드 hover:border-l-[#5C6584] 적용 */
              className={`rounded-lg p-3.5 transition-all duration-200 flex flex-col gap-1.5 border border-l-4 cursor-pointer ${
                isDarkMode 
                  ? 'bg-[#12172A] hover:bg-[#182038] border-[#1E253D] hover:border-[#2E334D] border-l-[#FB5D75] hover:border-l-[#5C6584]' 
                  : 'bg-white hover:bg-gray-50 border-gray-200 hover:border-gray-300 border-l-red-500 hover:border-l-gray-400 shadow-sm'
              }`}
            >
              <div className="flex justify-between items-center">
                <span className={`font-bold text-[13px] flex items-center gap-1.5 ${
                  isDarkMode ? 'text-[#FB5D75]' : 'text-red-600'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                    isDarkMode ? 'bg-[#FB5D75]' : 'bg-red-500'
                  }`}></span>
                  {alarm.equipName}
                </span>
                <span className={`text-[11px] font-mono ${isDarkMode ? 'text-[#5C6584]' : 'text-gray-400'}`}>
                  {alarm.time}
                </span>
              </div>
              <p className={`text-[12px] font-medium ${isDarkMode ? 'text-[#8592AD]' : 'text-gray-600'}`}>
                임계치 초과: <span className={`font-mono font-bold ${isDarkMode ? 'text-[#FB5D75]' : 'text-red-600'}`}>{alarm.value}</span> 
                <span className={isDarkMode ? 'text-[#5C6584]' : 'text-gray-400'}> / 기준 </span> 
                <span className={`font-mono ${isDarkMode ? 'text-[#A2ACC9]' : 'text-gray-700'}`}>{alarm.threshold}</span>
              </p>
              <span className={`text-[11px] ${isDarkMode ? 'text-[#5C6584]' : 'text-gray-400'}`}>
                위치: {alarm.location}
              </span>
            </div>
          ))
        )}
      </div>

      {/* 알람 건수 요약 뱃지 영역 */}
      <div className={`p-3 border-t flex justify-end gap-2 text-[11px] shrink-0 mt-auto transition-colors ${
        isDarkMode ? 'bg-[#0F1526] border-[#1E253D]' : 'bg-gray-50 border-gray-200'
      }`}>
        <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono font-bold ${
          isDarkMode 
            ? 'bg-[#FBBF24]/10 text-[#FBBF24]' 
            : 'bg-amber-50 text-amber-700 border border-amber-200'
        }`}>
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          주의 {Math.floor(alarms.length * 1.5)}
        </span>
        <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono font-bold ${
          isDarkMode 
            ? 'bg-[#FB5D75]/10 text-[#FB5D75]' 
            : 'bg-red-50 text-red-600 border border-red-200'
        }`}>
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
          경고 {alarms.length}
        </span>
      </div>
    </div>
  );
};

export default AlarmSidebar;