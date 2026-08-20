import React, { useEffect, useRef, useState } from 'react';
import CustomConfirm from './CustomConfirm';

// ==========================================
// 전체 로그 팝업 컴포넌트 (다크 / 라이트 모드 지원)
// ==========================================
const FullLogModal = ({ logs, onClear, onClose, isDarkMode, showTemperatureTab = true, showPowerTab = true }) => {
  const scrollRef = useRef(null);
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const hasScrolledInitially = useRef(false);

  // 온도/전력 필터 - 탭처럼 한쪽을 숨기는 게 아니라 기본은 "전체"로 둘 다 같이 보여주고,
  // 필요할 때만 온도/전력만 걸러 보게 함 ("전체 로그"인데 탭으로 반쪽을 숨기면 이상하다는 피드백)
  const canToggleMetric = showTemperatureTab && showPowerTab;
  const forcedMetricTab = !showTemperatureTab ? 'power' : !showPowerTab ? 'temperature' : null;
  const [internalMetricTab, setInternalMetricTab] = useState(forcedMetricTab ?? 'all');
  const effectiveMetricTab = forcedMetricTab ?? internalMetricTab;
  const filteredLogs = effectiveMetricTab === 'all'
    ? logs
    : logs.filter(l => (l.metric || 'temperature') === effectiveMetricTab);

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
    if (!hasScrolledInitially.current && filteredLogs.length > 0) {
      scrollToBottom('auto');
      hasScrolledInitially.current = true;
      updateIsAtBottom(true);
    } else if (isAtBottomRef.current) {
      scrollToBottom('smooth');
    }
  }, [filteredLogs]);

  // 온도/전력 탭을 전환하면 스크롤 위치가 새로 초기화될 수 있어, 탭 전환 시엔 무조건 맨 아래로 이동
  useEffect(() => {
    scrollToBottom('auto');
    updateIsAtBottom(true);
  }, [effectiveMetricTab]);

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // 뱃지/왼쪽 강조선/현재값 색을 전부 타입 하나로 통일해서 (전엔 뱃지는 주황인데 값 글자는
  // 빨강이라 따로 놀아서 헷갈렸음) 한눈에 심각도가 읽히게 함
  const typeBadge = {
    warning: {
      label: '임계값 근접',
      className: isDarkMode
        ? 'bg-[#FBBF24]/10 text-[#FBBF24] border-[#FBBF24]/30'
        : 'bg-amber-50 text-amber-700 border-amber-200',
      accent: isDarkMode ? 'border-l-[#FBBF24]' : 'border-l-amber-400',
      valueText: isDarkMode ? 'text-[#FBBF24]' : 'text-amber-600',
    },
    danger: {
      label: '초과 감지',
      className: isDarkMode
        ? 'bg-[#FB5D75]/10 text-[#FB5D75] border-[#FB5D75]/30'
        : 'bg-red-50 text-red-700 border-red-200',
      accent: isDarkMode ? 'border-l-[#FB5D75]' : 'border-l-red-500',
      valueText: isDarkMode ? 'text-[#FB5D75]' : 'text-red-600',
    },
    info: {
      label: '시스템 정보',
      className: isDarkMode
        ? 'bg-[#22D3EE]/10 text-[#22D3EE] border-[#22D3EE]/30'
        : 'bg-cyan-50 text-cyan-700 border-cyan-200',
      accent: isDarkMode ? 'border-l-[#22D3EE]' : 'border-l-cyan-400',
      valueText: isDarkMode ? 'text-[#22D3EE]' : 'text-cyan-600',
    },
    success: {
      label: '정상 복구',
      className: isDarkMode
        ? 'bg-[#34D399]/10 text-[#34D399] border-[#34D399]/30'
        : 'bg-green-50 text-green-700 border-green-200',
      accent: isDarkMode ? 'border-l-[#34D399]' : 'border-l-green-400',
      valueText: isDarkMode ? 'text-[#34D399]' : 'text-green-600',
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

            {canToggleMetric && (
              <div className={`relative flex items-center p-0.5 rounded-full border shrink-0 transition-colors ${
                isDarkMode ? 'bg-[#0D1224] border-[#232B45]' : 'bg-gray-100 border-gray-200'
              }`}>
                {[
                  { value: 'all', label: '전체' },
                  { value: 'temperature', label: '온도' },
                  { value: 'power', label: '전력' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setInternalMetricTab(opt.value)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide transition-colors outline-none ${
                      effectiveMetricTab === opt.value
                        ? (isDarkMode ? 'bg-[#1E2A4A] text-[#22D3EE] border border-[#22D3EE]/40' : 'bg-white text-green-700 border border-gray-300 shadow-sm')
                        : (isDarkMode ? 'text-[#7D87A8] hover:text-[#B9C2DE] border border-transparent' : 'text-gray-500 hover:text-gray-800 border border-transparent')
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}

            <span className={`text-[11px] px-2.5 py-1 rounded-full font-mono ${
              isDarkMode ? 'bg-[#1A2036] text-[#9FACC9]' : 'bg-gray-200 text-gray-600'
            }`}>
              총 {filteredLogs.length}건
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
              disabled={filteredLogs.length === 0}
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
          {filteredLogs.length > 0 ? (
            <div className={`divide-y ${isDarkMode ? 'divide-[#1A2036]' : 'divide-gray-200'}`}>
              {filteredLogs.map((log) => {
                // WARNING 타입은 "경고(임계값 근접)"와 "위험(임계값 초과)"을 같은 type으로 묶어서 내려주므로
                // 메시지 문구로 실제 심각도를 구분해 뱃지 색/라벨을 다르게 보여줌
                const badgeKey = log.type === 'warning' && log.message?.includes('초과') ? 'danger' : log.type;
                const badge = typeBadge[badgeKey] || typeBadge.info;
                const hasReading = log.value !== undefined && log.value !== null
                  && log.threshold !== undefined && log.threshold !== null;
                // 메시지가 "설비명가 ..."처럼 이름을 다시 앞에 붙여서 오는 경우, 이름을 굵게 이미
                // 따로 보여주고 있으니 메시지에서는 그 중복된 이름+조사 부분만 잘라냄
                const displayMessage = (log.equipName && log.message?.startsWith(log.equipName)
                  ? log.message.slice(log.equipName.length).replace(/^(가|이)\s*/, '')
                  : log.message
                  // 온도/전력 구분은 뱃지(logMetricLabel)나 탭으로 이미 보여주고 있어서, 메시지
                  // 본문에서 "온도 위험 상태입니다"처럼 다시 언급하는 건 중복이라 빼고 보여줌
                )?.replace(/^(온도|전력)\s*/, '');
                // "전체"로 온도/전력을 같이 볼 때는 행마다 어느 쪽인지 작게 표시해줌
                // (필터링해서 하나만 보고 있을 땐 이미 명확하니 굳이 안 보여줌)
                const logMetricLabel = effectiveMetricTab === 'all'
                  ? ((log.metric || 'temperature') === 'temperature' ? '온도' : '전력')
                  : null;

                return (
                  <div key={log.id} className={`px-4 sm:px-5 py-3.5 grid grid-cols-[96px_1fr_auto] items-center gap-3 sm:gap-4 border-l-4 transition-colors ${badge.accent} ${
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
                        {logMetricLabel && (
                          <span className={`inline-block mr-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold align-middle ${
                            isDarkMode ? 'bg-[#1A2036] text-[#7D87A8]' : 'bg-gray-100 text-gray-500'
                          }`}>
                            {logMetricLabel}
                          </span>
                        )}
                        <span className={`font-bold mr-1.5 ${isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-800'}`}>
                          {log.equipName || '시스템'}
                        </span>
                        {displayMessage}
                      </p>
                    </div>

                    <div className="shrink-0 flex flex-col items-end gap-0.5">
                      {hasReading ? (
                        <>
                          <span className={`font-mono text-[13px] font-bold whitespace-nowrap ${badge.valueText}`}>
                            {log.value}
                          </span>
                          <span className={`font-mono text-[10px] whitespace-nowrap ${isDarkMode ? 'text-[#5C6584]' : 'text-gray-400'}`}>
                            기준 {log.threshold}
                          </span>
                        </>
                      ) : (
                        <span className={`font-mono text-[13px] font-bold ${isDarkMode ? 'text-[#7D87A8]' : 'text-gray-300'}`}>-</span>
                      )}
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
        {filteredLogs.length > 0 && !isAtBottom && (
          <button
            onClick={() => scrollToBottom('auto')}
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
        message={isClearConfirmOpen ? `${effectiveMetricTab === 'all' ? '전체' : effectiveMetricTab === 'temperature' ? '온도' : '전력'} 로그를 삭제하시겠습니까?` : ''}
        onConfirm={() => { setIsClearConfirmOpen(false); onClear(effectiveMetricTab); }}
        onCancel={() => setIsClearConfirmOpen(false)}
        isDarkMode={isDarkMode}
      />
    </div>
  );
};

export default FullLogModal;