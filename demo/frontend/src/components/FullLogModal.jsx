import React, { useEffect, useRef, useState } from 'react';
import CustomConfirm from './CustomConfirm';

// ==========================================
// 전체 로그 팝업 컴포넌트 (다크 / 라이트 모드 지원)
// ==========================================
const FullLogModal = ({ logs, onClear, onClose, isDarkMode }) => {
  const scrollRef = useRef(null);
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const hasScrolledInitially = useRef(false);

  // 맨 아래에 있는지 여부 (맨 아래일 땐 "아래로" 버튼을 숨기고, 새 로그가 와도 자동으로 계속 아래에 붙어있음)
  const [isAtBottom, setIsAtBottom] = useState(true);
  const isAtBottomRef = useRef(true);

  const updateIsAtBottom = (value) => {
    isAtBottomRef.current = value;
    setIsAtBottom(value);
  };

  const scrollToBottom = (behavior = 'smooth') => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior });
  };

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    updateIsAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 30);
  };

  // 처음 열렸을 때는 맨 아래(최신)부터 보이도록 즉시 이동
  // 이미 맨 아래를 보고 있었다면, 새 로그가 추가돼도 계속 맨 아래에 붙어있게 함
  useEffect(() => {
    if (!hasScrolledInitially.current && logs.length > 0) {
      scrollToBottom('auto');
      hasScrolledInitially.current = true;
      updateIsAtBottom(true);
    } else if (isAtBottomRef.current) {
      scrollToBottom('smooth');
    }
  }, [logs]);

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const typeBadge = {
    warning: { 
      label: '초과 감지', 
      className: isDarkMode 
        ? 'bg-[#FBBF24]/10 text-[#FBBF24] border-[#FBBF24]/30' 
        : 'bg-amber-50 text-amber-700 border-amber-200' 
    },
    info: { 
      label: '시스템 정보', 
      className: isDarkMode 
        ? 'bg-[#22D3EE]/10 text-[#22D3EE] border-[#22D3EE]/30' 
        : 'bg-cyan-50 text-cyan-700 border-cyan-200' 
    },
    success: { 
      label: '정상 복구', 
      className: isDarkMode 
        ? 'bg-[#34D399]/10 text-[#34D399] border-[#34D399]/30' 
        : 'bg-green-50 text-green-700 border-green-200' 
    },
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: 'calc(100vw / 1.1)',
        height: 'calc(100vh / 1.1)',
        minWidth: '340px',
        backgroundColor: isDarkMode ? 'rgba(5, 8, 16, 0.75)' : 'rgba(0, 0, 0, 0.4)',
        backdropFilter: 'blur(3px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
      onClick={handleOverlayClick}
    >
      <div
        className={`rounded-xl shadow-2xl overflow-hidden flex flex-col h-[80vh] max-h-[800px] border transition-colors ${
          isDarkMode ? 'bg-[#12172A] border-[#232B45]' : 'bg-white border-gray-200'
        }`}
        style={{
          width: '100%',
          maxWidth: '700px',
          minWidth: '340px',
          position: 'relative',
          zIndex: 100000
        }}
      >

        {/* 상단 헤더 영역 */}
        <div className={`px-6 py-5 flex items-center justify-between shrink-0 z-10 border-b transition-colors ${
          isDarkMode 
            ? 'bg-[#0D1224] border-[#232B45] text-[#EDF1FC]' 
            : 'bg-gray-50 border-gray-200 text-gray-800'
        }`}>
          <div className="flex items-center gap-3">
            <h2 className="text-[16px] font-bold tracking-tight m-0">전체 로그</h2>
            <span className={`text-[11px] px-2.5 py-1 rounded-full font-mono ${
              isDarkMode ? 'bg-[#1A2036] text-[#9FACC9]' : 'bg-gray-200 text-gray-600'
            }`}>
              총 {logs.length}건
            </span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsClearConfirmOpen(true)}
              className={`px-3 py-1.5 text-[13px] font-bold rounded-lg transition-colors flex items-center gap-1 cursor-pointer border disabled:opacity-40 disabled:cursor-not-allowed ${
                isDarkMode 
                  ? 'bg-[#FB5D75]/10 hover:bg-[#FB5D75]/20 text-[#FB5D75] border-[#FB5D75]/30' 
                  : 'bg-red-50 hover:bg-red-100 text-red-600 border-red-200'
              }`}
              disabled={logs.length === 0}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
              지우기
            </button>
            <button
              onClick={onClose}
              className={`text-2xl leading-none transition-colors outline-none bg-transparent border-none cursor-pointer ${
                isDarkMode ? 'text-[#7D87A8] hover:text-[#EDF1FC]' : 'text-gray-400 hover:text-gray-800'
              }`}
            >
              &times;
            </button>
          </div>
        </div>

        {/* 팝업 본문 (로그 리스트 영역) */}
        <div className="relative flex-1 min-h-0">
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className={`h-full overflow-y-auto p-0 flex flex-col justify-start transition-colors ${
              isDarkMode ? 'bg-[#0A0E1A]' : 'bg-gray-50/50'
            }`}
          >
          {logs.length > 0 ? (
            <div className={`divide-y ${isDarkMode ? 'divide-[#1A2036]' : 'divide-gray-200'}`}>
              {logs.map((log) => {
                const badge = typeBadge[log.type] || typeBadge.info;
                const isWarning = log.type === 'warning';
                const hasReading = log.value !== undefined && log.value !== null
                  && log.threshold !== undefined && log.threshold !== null;

                return (
                  <div key={log.id} className={`px-4 sm:px-5 py-3.5 grid grid-cols-[96px_1fr_auto] items-center gap-3 sm:gap-4 transition-colors ${
                    isDarkMode ? 'hover:bg-[#0F1526]' : 'hover:bg-white'
                  }`}>

                    <div className="flex flex-col items-start gap-1 min-w-0">
                      <span className={`font-mono text-[11px] ${
                        isDarkMode ? 'text-[#7D87A8]' : 'text-gray-400'
                      }`}>
                        {log.time}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border whitespace-nowrap ${badge.className}`}>
                        {badge.label}
                      </span>
                    </div>

                    <div className="min-w-0">
                      <p className={`text-[13px] sm:text-[14px] font-medium m-0 leading-snug ${
                        isDarkMode ? 'text-[#B9C2DE]' : 'text-gray-600'
                      }`}>
                        <span className={`font-bold mr-1.5 ${isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-800'}`}>
                          {log.equipName || '시스템'}
                        </span>
                        {log.message}
                      </p>
                    </div>

                    <div className={`shrink-0 text-right font-mono text-[13px] font-bold whitespace-nowrap ${
                      !hasReading
                        ? (isDarkMode ? 'text-[#7D87A8]' : 'text-gray-300')
                        : isWarning
                          ? (isDarkMode ? 'text-[#FB5D75]' : 'text-red-600')
                          : (isDarkMode ? 'text-[#34D399]' : 'text-green-600')
                    }`}>
                      {hasReading ? `${log.value} / ${log.threshold}` : '-'}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className={`h-full flex flex-col items-center justify-center p-8 text-center gap-3 ${
              isDarkMode ? 'text-[#7D87A8]' : 'text-gray-400'
            }`}>
              <svg className={`w-12 h-12 ${isDarkMode ? 'text-[#232B45]' : 'text-gray-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
              </svg>
              <p className="font-medium text-[15px] m-0">기록된 로그 이력이 없습니다.</p>
            </div>
          )}
        </div>

        {/* 가장 아래(최신)로 이동하는 원형 플로팅 버튼 (맨 아래에 있을 땐 숨김) */}
        {logs.length > 0 && !isAtBottom && (
          <button
            onClick={() => scrollToBottom()}
            title="최신 로그로 이동"
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
      </div>

      <CustomConfirm
        message={isClearConfirmOpen ? '전체 로그를 삭제하시겠습니까?' : ''}
        onConfirm={() => { setIsClearConfirmOpen(false); onClear(); }}
        onCancel={() => setIsClearConfirmOpen(false)}
        isDarkMode={isDarkMode}
      />
    </div>
  );
};

export default FullLogModal;