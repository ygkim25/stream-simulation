import React, { useEffect, useRef, useState } from 'react';
import CustomConfirm from './CustomConfirm';

// ==========================================
// 우측 알람 패널 컴포넌트 (다크 / 라이트 모드 지원)
// ==========================================
const AlarmSidebar = ({ alarms, onClear, onDismiss, onAlarmClick, openLogs, selectedEquipName, onClearFilter, statusCounts, isDarkMode }) => {
  const counts = statusCounts || { normal: 0, warning: 0, danger: 0 };
  const listRef = useRef(null);
  const hasScrolledInitially = useRef(false);

  // "지우기" 버튼 클릭 시 바로 지우지 않고 확인 팝업을 먼저 띄움
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const handleClearClick = () => setIsClearConfirmOpen(true);
  const handleClearConfirm = () => {
    setIsClearConfirmOpen(false);
    onClear?.();
  };

  // 맨 아래에 있는지 여부 (맨 아래일 땐 "아래로" 버튼을 숨기고, 새 알람이 와도 자동으로 계속 아래에 붙어있음)
  const [isAtBottom, setIsAtBottom] = useState(true);
  const isAtBottomRef = useRef(true);

  const scrollToBottom = (behavior = 'smooth') => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior });
  };

  const updateIsAtBottom = (value) => {
    isAtBottomRef.current = value;
    setIsAtBottom(value);
  };

  const handleScroll = () => {
    const el = listRef.current;
    if (!el) return;
    updateIsAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 30);
  };

  // 알람이 처음 채워졌을 때는 맨 위(오래된 것)가 아니라 맨 아래(최신)부터 보이도록 즉시 이동
  // 이미 맨 아래를 보고 있었다면, 새 알람이 추가돼도 계속 맨 아래에 붙어있게 함
  useEffect(() => {
    if (!hasScrolledInitially.current && alarms.length > 0) {
      scrollToBottom('auto');
      hasScrolledInitially.current = true;
      updateIsAtBottom(true);
    } else if (isAtBottomRef.current) {
      scrollToBottom('smooth');
    }
  }, [alarms]);

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
              onClick={openLogs}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer border ${
                isDarkMode
                  ? 'border-[#232B45] hover:border-[#2A335A] hover:bg-[#151B30] text-[#9FACC9] hover:text-[#EDF1FC]'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-100 text-gray-600 hover:text-gray-900'
              }`}
            >
              전체 로그
            </button>
            <button
              onClick={handleClearClick}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                isDarkMode
                  ? 'bg-[#1A2036] hover:bg-[#232B45] text-[#B9C2DE]'
                  : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
              }`}
            >
              지우기
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

      {/* 알람 카드 리스트 영역 (오래된 순 → 최신순, 최신이 아래쪽) */}
      <div className="relative flex-1 min-h-0">
        <div
          ref={listRef}
          onScroll={handleScroll}
          className={`h-full overflow-y-auto p-3 space-y-2 transition-colors ${
            isDarkMode ? 'bg-[#0A0E1A]' : 'bg-gray-50/50'
          }`}
        >
          {alarms.length === 0 ? (
            <div className={`h-full flex flex-col items-center justify-center text-sm gap-2 ${
              isDarkMode ? 'text-[#7D87A8]' : 'text-gray-400'
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
                onClick={() => onAlarmClick?.(alarm)}
                /* [수정] 다크모드 hover:border-l-[#5C6584] 적용 */
                className={`group relative rounded-lg p-3.5 transition-all duration-200 flex flex-col gap-1.5 border border-l-4 cursor-pointer ${
                  isDarkMode
                    ? 'bg-[#12172A] hover:bg-[#182038] border-[#1E253D] hover:border-[#2E334D] border-l-[#FB5D75] hover:border-l-[#5C6584]'
                    : 'bg-white hover:bg-gray-50 border-gray-200 hover:border-gray-300 border-l-red-500 hover:border-l-gray-400 shadow-sm'
                }`}
              >
                <button
                  onClick={(e) => { e.stopPropagation(); onDismiss?.(alarm.id); }}
                  title="알람 삭제"
                  className={`absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer ${
                    isDarkMode
                      ? 'bg-[#1A2036] hover:bg-[#2A335A] text-[#9FACC9] hover:text-[#EDF1FC]'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-800'
                  }`}
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                <div className="flex justify-between items-center pr-5">
                  <span className={`font-bold text-[13px] flex items-center gap-1.5 ${
                    isDarkMode ? 'text-[#FB5D75]' : 'text-red-600'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                      isDarkMode ? 'bg-[#FB5D75]' : 'bg-red-500'
                    }`}></span>
                    {alarm.equipName}
                  </span>
                  <span className={`text-[11px] font-mono ${isDarkMode ? 'text-[#7D87A8]' : 'text-gray-400'}`}>
                    {alarm.time}
                  </span>
                </div>
                <p className={`text-[12px] font-medium ${isDarkMode ? 'text-[#9FACC9]' : 'text-gray-600'}`}>
                  임계치 초과: <span className={`font-mono font-bold ${isDarkMode ? 'text-[#FB5D75]' : 'text-red-600'}`}>{alarm.value}</span>
                  <span className={isDarkMode ? 'text-[#7D87A8]' : 'text-gray-400'}> / 기준 </span>
                  <span className={`font-mono ${isDarkMode ? 'text-[#B9C2DE]' : 'text-gray-700'}`}>{alarm.threshold}</span>
                </p>
                <span className={`text-[11px] ${isDarkMode ? 'text-[#7D87A8]' : 'text-gray-400'}`}>
                  위치: {alarm.location}
                </span>
              </div>
            ))
          )}
        </div>

        {/* 가장 아래(최신)로 이동하는 원형 플로팅 버튼 (맨 아래에 있을 땐 숨김) */}
        {alarms.length > 0 && !isAtBottom && (
          <button
            onClick={() => scrollToBottom()}
            title="최신 알람으로 이동"
            className={`absolute bottom-3 right-3 w-9 h-9 rounded-full flex items-center justify-center backdrop-blur-md border transition-all duration-200 cursor-pointer hover:scale-110 hover:shadow-lg active:scale-95 ${
              isDarkMode
                ? 'bg-[#12172A]/50 hover:bg-[#12172A]/90 border-[#232B45] hover:border-[#22D3EE]/60 text-[#22D3EE]'
                : 'bg-white/50 hover:bg-white/90 border-gray-200 hover:border-green-400 text-green-700'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </button>
        )}
      </div>

      {/* 설비 상태 요약 뱃지 영역 (정상/경고/위험 - 현재 설비 상태 기준) */}
      <div className={`p-3 border-t flex justify-end gap-2 text-[11px] shrink-0 mt-auto transition-colors ${
        isDarkMode ? 'bg-[#0F1526] border-[#1E253D]' : 'bg-gray-50 border-gray-200'
      }`}>
        <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono font-bold ${
          isDarkMode
            ? 'bg-[#34D399]/10 text-[#34D399]'
            : 'bg-green-50 text-green-700 border border-green-200'
        }`}>
          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
          정상 {counts.normal}
        </span>
        <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono font-bold ${
          isDarkMode
            ? 'bg-[#FBBF24]/10 text-[#FBBF24]'
            : 'bg-amber-50 text-amber-700 border border-amber-200'
        }`}>
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          경고 {counts.warning}
        </span>
        <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono font-bold ${
          isDarkMode
            ? 'bg-[#FB5D75]/10 text-[#FB5D75]'
            : 'bg-red-50 text-red-600 border border-red-200'
        }`}>
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
          위험 {counts.danger}
        </span>
      </div>

      <CustomConfirm
        message={isClearConfirmOpen ? '전체 알람을 지우시겠습니까?' : ''}
        onConfirm={handleClearConfirm}
        onCancel={() => setIsClearConfirmOpen(false)}
        isDarkMode={isDarkMode}
      />
    </div>
  );
};

export default AlarmSidebar;