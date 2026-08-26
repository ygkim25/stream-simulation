import React, { useEffect, useRef, useState } from 'react';
import CustomConfirm from './CustomConfirm';
import { useClickOutside } from '../utils/useClickOutside';
import { STATUS_DOT_CLASS, DEFAULT_STATUS_INFO_LINES } from '../utils/statusStyles';

// ==========================================
// 우측 알람 패널 컴포넌트 (다크 / 라이트 모드 지원)
// ==========================================
const AlarmSidebar = ({
  alarms, onClear, onDismiss, onAlarmClick, openLogs, selectedEquipName, onClearFilter, statusCounts, isDarkMode,
  showTemperatureTab = true, showPowerTab = true,
  // 외부(실시간 모니터링의 그리드 탭 등)에서 값을 내려주면 자체 토글 UI 없이 그 값을 그대로 따름
  // (그리드/설비별 온도추이/알람이 각자 따로 노는 토글이었는데, 그리드 탭 하나로 다같이 움직이도록 통일함)
  metricTab: controlledMetricTab,
  // 정상/경고/위험 판정 기준 설명 - 화면(실시간/시뮬레이션)마다 판정 규칙이 달라서 이 prop으로
  // 각 화면에서 실제 기준에 맞는 설명을 내려주고, 안 내려주면 기본값(실시간 기준)을 씀
  statusInfoLines = DEFAULT_STATUS_INFO_LINES,
}) => {
  // "알람" 옆 정보 아이콘 - 누르면 정상/경고/위험 판정 기준을 보여주는 팝오버
  const infoRef = useRef(null);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  useClickOutside(infoRef, () => setIsInfoOpen(false), isInfoOpen);
  const listRef = useRef(null);
  const hasScrolledInitially = useRef(false);

  // 온도 / 전력 알람 탭 (metric 필드가 없으면 온도로 취급 - 시뮬레이션 모드처럼 온도만 있는 화면과 호환).
  // 시뮬레이션 모드는 업로드한 시나리오에 한쪽 지표만 있을 수도 있어서, 그럴 땐 탭 자체를 숨기고
  // 있는 지표로 고정함 (없는 지표를 굳이 탭으로 보여줄 필요가 없음)
  const isControlled = controlledMetricTab !== undefined;
  const canToggleMetric = !isControlled && showTemperatureTab && showPowerTab;
  const forcedMetricTab = !showTemperatureTab ? 'power' : !showPowerTab ? 'temperature' : null;
  const [internalMetricTab, setInternalMetricTab] = useState(forcedMetricTab ?? 'temperature');
  const effectiveMetricTab = isControlled ? controlledMetricTab : (forcedMetricTab ?? internalMetricTab);
  const filteredAlarms = alarms.filter(a => (a.metric || 'temperature') === effectiveMetricTab);

  // statusCounts는 단일 지표 화면(실시간)에선 그냥 {normal,warning,danger}로, 두 지표를 다 다루는
  // 화면(시뮬레이션)에선 {temperature:{...}, power:{...}}로 내려옴 - 지금 탭에 맞는 값을 뽑아 씀
  const counts = (statusCounts && 'normal' in statusCounts ? statusCounts : statusCounts?.[effectiveMetricTab])
    || { normal: 0, warning: 0, danger: 0 };

  // "지우기" 버튼 클릭 시 바로 지우지 않고 확인 팝업을 먼저 띄움
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const handleClearClick = () => setIsClearConfirmOpen(true);
  const handleClearConfirm = () => {
    setIsClearConfirmOpen(false);
    // 지금 보고 있는 지표(온도/전력)의 알람만 지우도록, 부모가 판단할 수 있게 넘겨줌
    onClear?.(effectiveMetricTab);
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
    if (!hasScrolledInitially.current && filteredAlarms.length > 0) {
      scrollToBottom('auto');
      hasScrolledInitially.current = true;
      updateIsAtBottom(true);
    } else if (isAtBottomRef.current) {
      scrollToBottom('smooth');
    }
  }, [filteredAlarms]);

  // 온도/전력 탭 전환뿐 아니라 설비 필터(알람 클릭/필터 해제)가 걸리거나 풀릴 때도 목록 내용이
  // 통째로 바뀌는데, 예전엔 이 경우엔 스크롤 위치를 안 건드려서 - 필터 걸기 전 스크롤 위치(예: 위쪽)가
  // 그대로 남아있는 채 훨씬 짧아진 필터링 결과에 적용되며, 실제 알람 카드들이 화면 아래쪽으로
  // 밀려 보이는 것처럼 느껴졌음(스크롤 가능 범위가 줄어든 만큼 브라우저가 위치를 보정하면서 생기는
  // 현상). 탭 전환과 마찬가지로 무조건 맨 아래(최신)로 이동시켜 깔끔하게 리셋함
  useEffect(() => {
    scrollToBottom('auto');
    updateIsAtBottom(true);
  }, [effectiveMetricTab, selectedEquipName]);

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
          <div className="flex items-center gap-2.5 shrink-0 min-w-0">
            <span className={`font-bold text-[15px] tracking-tight shrink-0 ${
              isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-800'
            }`}>
              알람
            </span>

            {/* 온도 / 전력 알람 탭 전환 (개수 표시) - 한쪽 지표만 있는 화면(시뮬레이션의 단일 지표
                시나리오 등)에서는 토글을 아예 숨기고 있는 지표로 고정함 */}
            {canToggleMetric && (
              <div className={`relative flex items-center p-0.5 rounded-full border shrink-0 transition-colors ${
                isDarkMode ? 'bg-[#0D1224] border-[#232B45]' : 'bg-gray-100 border-gray-200'
              }`}>
                <button
                  type="button"
                  onClick={() => setInternalMetricTab('temperature')}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide transition-colors outline-none ${
                    effectiveMetricTab === 'temperature'
                      ? (isDarkMode ? 'bg-[#1E2A4A] text-[#22D3EE] border border-[#22D3EE]/40' : 'bg-white text-green-700 border border-gray-300 shadow-sm')
                      : (isDarkMode ? 'text-[#7D87A8] hover:text-[#B9C2DE] border border-transparent' : 'text-gray-500 hover:text-gray-800 border border-transparent')
                  }`}
                >
                  온도
                </button>
                <button
                  type="button"
                  onClick={() => setInternalMetricTab('power')}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide transition-colors outline-none ${
                    effectiveMetricTab === 'power'
                      ? (isDarkMode ? 'bg-[#1E2A4A] text-[#22D3EE] border border-[#22D3EE]/40' : 'bg-white text-green-700 border border-gray-300 shadow-sm')
                      : (isDarkMode ? 'text-[#7D87A8] hover:text-[#B9C2DE] border border-transparent' : 'text-gray-500 hover:text-gray-800 border border-transparent')
                  }`}
                >
                  전력
                </button>
              </div>
            )}

            <span className={`text-[11px] px-2 py-0.5 rounded-full font-mono font-bold shrink-0 ${
              isDarkMode
                ? 'bg-[#FB5D75]/15 text-[#FB5D75]'
                : 'bg-red-100 text-red-600 border border-red-200'
            }`}>
              {filteredAlarms.length}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
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
              ? 'bg-[#1A2036] border-[#2A335A]'
              : 'bg-gray-100 border-gray-300'
          }`}>
            <span className={`text-[11px] font-bold truncate ${isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-700'}`}>
              ▸ {selectedEquipName} 알람만 표시 중
            </span>
            <button
              onClick={onClearFilter}
              className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors cursor-pointer border-none shrink-0 ml-2 ${
                isDarkMode
                  ? 'text-[#9FACC9] hover:text-[#EDF1FC] bg-[#232B45] hover:bg-[#2A335A]'
                  : 'text-gray-600 hover:text-gray-900 bg-gray-200 hover:bg-gray-300'
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
          key={`${effectiveMetricTab}-${selectedEquipName ?? 'all'}`}
          ref={listRef}
          onScroll={handleScroll}
          className={`alarm-slide-down h-full overflow-y-auto p-3 space-y-2 transition-colors ${
            isDarkMode ? 'bg-[#0A0E1A]' : 'bg-gray-50/50'
          }`}
        >
          {filteredAlarms.length === 0 ? (
            <div className={`h-full flex flex-col items-center justify-center text-sm gap-2 ${
              isDarkMode ? 'text-[#7D87A8]' : 'text-gray-400'
            }`}>
              <svg className={`w-10 h-10 ${isDarkMode ? 'text-[#232B45]' : 'text-gray-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path>
              </svg>
              <span>{selectedEquipName ? '해당 설비에 대한 발생 알람이 없습니다.' : '감지된 이상 알람이 없습니다.'}</span>
            </div>
          ) : (
            filteredAlarms.map(alarm => (
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
                    <span className={`status-dot animate-pulse ${
                      isDarkMode ? 'bg-[#FB5D75]' : 'bg-red-500'
                    }`}></span>
                    {alarm.equipName}
                  </span>
                  <span className={`text-[11px] font-mono ${isDarkMode ? 'text-[#7D87A8]' : 'text-gray-400'}`}>
                    {alarm.time}
                  </span>
                </div>
                <p className={`text-[12px] font-medium ${isDarkMode ? 'text-[#9FACC9]' : 'text-gray-600'}`}>
                  {alarm.metric === 'power' ? '전력' : '온도'} 임계치 초과: <span className={`font-mono font-bold ${isDarkMode ? 'text-[#FB5D75]' : 'text-red-600'}`}>{alarm.value}</span>
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
        {filteredAlarms.length > 0 && !isAtBottom && (
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
      <div className={`p-3 border-t flex items-center justify-between gap-2 text-[11px] shrink-0 mt-auto transition-colors ${
        isDarkMode ? 'bg-[#0F1526] border-[#1E253D]' : 'bg-gray-50 border-gray-200'
      }`}>
        <div className="relative shrink-0" ref={infoRef}>
          <button
            type="button"
            onClick={() => setIsInfoOpen(v => !v)}
            title="정상/경고/위험 판정 기준"
            className={`w-4 h-4 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
              isDarkMode ? 'text-[#5C6584] hover:text-[#EDF1FC]' : 'text-gray-400 hover:text-gray-700'
            }`}
          >
            <svg className="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9" strokeWidth="1.75" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M12 11v5" />
              <circle cx="12" cy="8" r="0.9" fill="currentColor" stroke="none" />
            </svg>
          </button>
          {/* 아이콘이 패널 맨 아래에 있어서 팝오버를 아래로 열면 잘리므로 위쪽으로 열림 */}
          {isInfoOpen && (
            <div className={`absolute z-30 bottom-6 left-0 w-56 rounded-lg border p-3 text-[11px] shadow-lg space-y-1.5 ${
              isDarkMode ? 'bg-[#12172A] border-[#232B45] text-[#B9C2DE]' : 'bg-white border-gray-200 text-gray-600'
            }`}>
              {statusInfoLines.map(line => (
                <div key={line.label} className="flex items-start gap-1.5">
                  <span className={`status-dot mt-1 shrink-0 ${STATUS_DOT_CLASS[line.color]}`} />
                  <span>
                    <b className={isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-800'}>{line.label}</b> · {line.desc}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono font-bold ${
            isDarkMode
              ? 'bg-[#34D399]/10 text-[#34D399]'
              : 'bg-green-50 text-green-700 border border-green-200'
          }`}>
            <span className="status-dot bg-green-500" />
            정상 <span className="inline-block min-w-[1.6em] text-right tabular-nums">{counts.normal}</span>
          </span>
          <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono font-bold ${
            isDarkMode
              ? 'bg-[#FBBF24]/10 text-[#FBBF24]'
              : 'bg-amber-50 text-amber-700 border border-amber-200'
          }`}>
            <span className="status-dot bg-amber-500" />
            경고 <span className="inline-block min-w-[1.6em] text-right tabular-nums">{counts.warning}</span>
          </span>
          <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono font-bold ${
            isDarkMode
              ? 'bg-[#FB5D75]/10 text-[#FB5D75]'
              : 'bg-red-50 text-red-600 border border-red-200'
          }`}>
            <span className="status-dot bg-red-500" />
            위험 <span className="inline-block min-w-[1.6em] text-right tabular-nums">{counts.danger}</span>
          </span>
        </div>
      </div>

      <CustomConfirm
        message={isClearConfirmOpen ? `${effectiveMetricTab === 'temperature' ? '온도' : '전력'} 알람을 지우시겠습니까?` : ''}
        onConfirm={handleClearConfirm}
        onCancel={() => setIsClearConfirmOpen(false)}
        isDarkMode={isDarkMode}
      />
    </div>
  );
};

export default AlarmSidebar;