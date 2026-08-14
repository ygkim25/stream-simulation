import React, { useEffect, useRef, useState, memo } from 'react';
import { ResponsiveContainer, AreaChart, Area } from 'recharts';
import { getRecentByEquipIdFromDB } from '../utils/indexedDb';
import { getStatusMeta } from '../utils/statusStyles';
import LoadingSpinner from './LoadingSpinner';

// 카드 하나당 표시할 최근 데이터 포인트 수 (많을수록 시간 흐름이 더 촘촘하게 보임)
const MAX_POINTS = 40;
// IndexedDB 재조회 주기 (모든 웹소켓 틱마다 조회하면 부하가 크므로 주기적으로만 갱신)
const REFRESH_MS = 4000;

const STATUS_COLOR = {
  green: { dark: '#34D399', light: '#22C55E' },
  amber: { dark: '#FBBF24', light: '#F59E0B' },
  red: { dark: '#FB5D75', light: '#EF4444' },
};

// ==========================================
// 설비별 미니 추이 카드 그리드
// 설비마다 최근 흐름을 라인 형태로 보여줘서 "시간에 따른 변화"가 한눈에 보이게 함
// (그리드 우측 상단, IndexedDB에 누적된 실시간 데이터 사용, 백엔드 미사용)
// ==========================================
const EquipmentTrendGrid = ({ equipments, isDarkMode, onSelectEquip, statusCounts }) => {
  const [metric, setMetric] = useState('temperature'); // 'temperature' | 'power'
  const [historyMap, setHistoryMap] = useState({}); // equipId -> 시간순 정렬된 최근 데이터 배열
  // 첫 조회가 끝나기 전까지는 "데이터가 확실히 부족함"과 구분해서 로딩 표시를 해줌
  const [hasLoadedHistoryOnce, setHasLoadedHistoryOnce] = useState(false);

  // 매 조회 시점의 최신 설비 목록을 참조하기 위한 ref (interval을 재시작하지 않고도 최신 목록을 반영)
  const equipIdsRef = useRef([]);
  useEffect(() => {
    equipIdsRef.current = equipments.map(eq => eq.equipId);
  }, [equipments]);

  // 마운트 시점엔 설비 목록이 아직 안 온 경우가 많아서(REST 조회가 끝나기 전) 예전엔 첫 조회가 그냥
  // 빈 목록으로 건너뛰어지고, 다음 REFRESH_MS(4초) 주기까지 기다려야 카드가 채워졌음. 목록이 실제로
  // 채워지는 시점에 맞춰 바로 첫 조회가 실행되도록 이 시점을 deps로 잡음
  const hasEquipIds = equipments.length > 0;
  useEffect(() => {
    if (!hasEquipIds) return;
    let cancelled = false;
    const load = async () => {
      const ids = equipIdsRef.current;
      if (ids.length === 0) return;
      try {
        // equipId 인덱스로 설비별 최근 데이터만 바로 조회 (전체 스캔 없이 항상 빠름)
        const results = await Promise.all(ids.map(id => getRecentByEquipIdFromDB(id, MAX_POINTS)));
        if (cancelled) return;
        const grouped = {};
        ids.forEach((id, i) => { grouped[id] = results[i]; });
        setHistoryMap(grouped);
        setHasLoadedHistoryOnce(true);
      } catch (e) {
        console.error('설비 추이 조회 실패:', e);
      }
    };
    load();
    const intervalId = setInterval(load, REFRESH_MS);
    return () => { cancelled = true; clearInterval(intervalId); };
  }, [hasEquipIds]);

  const sortedEquipments = [...equipments].sort((a, b) => {
    const aNum = Number(a.equipId);
    const bNum = Number(b.equipId);
    if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) return aNum - bNum;
    return String(a.equipId).localeCompare(String(b.equipId));
  });

  const unit = metric === 'temperature' ? '℃' : '';
  const dotColor = metric === 'temperature'
    ? (isDarkMode ? 'bg-[#FB5D75]' : 'bg-red-500')
    : (isDarkMode ? 'bg-[#22D3EE]' : 'bg-green-600');

  return (
    <div className={`w-full h-full rounded-xl p-3.5 border transition-colors flex flex-col min-h-0 overflow-hidden ${
      isDarkMode ? 'bg-[#12172A] border-[#1E253D]' : 'bg-white border-gray-200 shadow-sm'
    }`}>
      <div className="flex items-center justify-between gap-2 mb-2.5 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
          <span className={`text-[15px] font-bold truncate ${isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-800'}`}>
            설비별 {metric === 'temperature' ? '온도' : '전력'} 추이
          </span>
        </div>

        {/* 온도 / 전력 탭 전환 버튼 */}
        <div className={`relative flex items-center p-0.5 rounded-full border shrink-0 transition-colors ${
          isDarkMode ? 'bg-[#0D1224] border-[#232B45]' : 'bg-gray-100 border-gray-200'
        }`}>
          <button
            onClick={() => setMetric('temperature')}
            className={`px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide transition-colors outline-none focus:outline-none focus-visible:outline-none ${
              metric === 'temperature'
                ? (isDarkMode ? 'bg-[#1E2A4A] text-[#22D3EE] border border-[#22D3EE]/40' : 'bg-white text-green-700 border border-gray-300 shadow-sm')
                : (isDarkMode ? 'text-[#7D87A8] hover:text-[#B9C2DE]' : 'text-gray-500 hover:text-gray-800')
            }`}
          >
            온도
          </button>
          <button
            onClick={() => setMetric('power')}
            className={`px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide transition-colors outline-none focus:outline-none focus-visible:outline-none ${
              metric === 'power'
                ? (isDarkMode ? 'bg-[#1E2A4A] text-[#22D3EE] border border-[#22D3EE]/40' : 'bg-white text-green-700 border border-gray-300 shadow-sm')
                : (isDarkMode ? 'text-[#7D87A8] hover:text-[#B9C2DE]' : 'text-gray-500 hover:text-gray-800')
            }`}
          >
            전력
          </button>
        </div>
      </div>

      {sortedEquipments.length === 0 ? (
        <div className={`flex-1 min-h-0 flex items-center justify-center text-xs ${isDarkMode ? 'text-[#5C6584]' : 'text-gray-400'}`}>
          데이터 없음
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
          <div className="grid grid-cols-2 gap-2.5 pr-1 pb-1">
            {sortedEquipments.map(eq => {
              const points = (historyMap[eq.equipId] || [])
                .map(item => ({ value: metric === 'temperature' ? item.temperature : item.power }))
                .filter(p => p.value != null);
              const latest = points.length > 0 ? points[points.length - 1].value : null;
              const prev = points.length > 1 ? points[points.length - 2].value : null;
              const delta = latest != null && prev != null ? latest - prev : null;
              const statusColor = getStatusMeta(metric === 'temperature' ? eq.status : eq.powerStatus).color;
              const color = STATUS_COLOR[statusColor][isDarkMode ? 'dark' : 'light'];
              const gradientId = `spark-grad-${eq.equipId}-${metric}`;
              const glowId = `spark-glow-${eq.equipId}-${metric}`;

              return (
                <div
                  key={eq.equipId}
                  onClick={() => onSelectEquip?.(eq.equipId, metric)}
                  title="클릭하면 자세히 보기"
                  className={`group relative rounded-xl border overflow-hidden transition-all duration-300 cursor-pointer hover:shadow-lg hover:-translate-y-0.5 ${
                    isDarkMode
                      ? 'border-[#1E253D] hover:border-[#2A335A]'
                      : 'border-gray-200 hover:border-gray-300 shadow-sm'
                  }`}
                  style={{
                    background: isDarkMode
                      ? 'linear-gradient(160deg, #121A33 0%, #0C1122 100%)'
                      : 'linear-gradient(160deg, #FFFFFF 0%, #F7F9FC 100%)',
                  }}
                >
                  {/* 상태 컬러 액센트 바 */}
                  <div className="absolute top-0 left-0 right-0 h-[2.5px]" style={{ backgroundColor: color, opacity: 0.85 }} />

                  <div className="px-2.5 pt-2 pb-1.5">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span className={`truncate text-[11px] font-semibold tracking-tight ${isDarkMode ? 'text-[#DCE2F5]' : 'text-gray-700'}`} title={eq.equipName}>
                        {eq.equipName}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-[15px] font-bold font-mono tabular-nums" style={{ color }}>
                        {latest != null ? Number(latest).toFixed(1) : '–'}
                      </span>
                      <span className={`text-[10px] font-mono ${isDarkMode ? 'text-[#5C6584]' : 'text-gray-400'}`}>{unit}</span>
                      {delta != null && Math.abs(delta) >= 0.05 && (
                        <span className={`text-[10px] font-mono font-bold ml-auto ${
                          delta > 0
                            ? (isDarkMode ? 'text-[#FB5D75]' : 'text-red-500')
                            : (isDarkMode ? 'text-[#38BDF8]' : 'text-blue-500')
                        }`}>
                          {delta > 0 ? '▲' : '▼'}{Math.abs(delta).toFixed(1)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ height: 42 }} className="px-0.5 pb-0.5">
                    {!hasLoadedHistoryOnce ? (
                      <div className="h-full flex items-center justify-center">
                        <LoadingSpinner size="sm" isDarkMode={isDarkMode} />
                      </div>
                    ) : points.length > 1 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={points} margin={{ top: 2, right: 4, left: 4, bottom: 0 }}>
                          <defs>
                            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={color} stopOpacity={0.5} />
                              <stop offset="100%" stopColor={color} stopOpacity={0} />
                            </linearGradient>
                            {isDarkMode && (
                              <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
                                <feGaussianBlur stdDeviation="1.6" result="blur" />
                                <feMerge>
                                  <feMergeNode in="blur" />
                                  <feMergeNode in="SourceGraphic" />
                                </feMerge>
                              </filter>
                            )}
                          </defs>
                          <Area
                            type="monotone"
                            dataKey="value"
                            stroke={color}
                            strokeWidth={1.75}
                            fill={`url(#${gradientId})`}
                            dot={false}
                            isAnimationActive={false}
                            style={isDarkMode ? { filter: `url(#${glowId})` } : undefined}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className={`h-full flex items-center justify-center text-[10px] ${isDarkMode ? 'text-[#5C6584]' : 'text-gray-400'}`}>
                        수집 중...
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 정상/경고/위험 요약 (statusCounts가 전달된 경우에만 표시 - 일반 사용자용, 알람 패널 하단과 동일한 모양) */}
      {statusCounts && (
        <div className={`-mx-3.5 -mb-3.5 mt-3.5 px-3 py-3 border-t flex justify-end gap-2 text-[11px] shrink-0 transition-colors ${
          isDarkMode ? 'bg-[#0F1526] border-[#1E253D]' : 'bg-gray-50 border-gray-200'
        }`}>
          <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono font-bold ${
            isDarkMode ? 'bg-[#34D399]/10 text-[#34D399]' : 'bg-green-50 text-green-700 border border-green-200'
          }`}>
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            정상 {statusCounts.normal}
          </span>
          <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono font-bold ${
            isDarkMode ? 'bg-[#FBBF24]/10 text-[#FBBF24]' : 'bg-amber-50 text-amber-700 border border-amber-200'
          }`}>
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            경고 {statusCounts.warning}
          </span>
          <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono font-bold ${
            isDarkMode ? 'bg-[#FB5D75]/10 text-[#FB5D75]' : 'bg-red-50 text-red-600 border border-red-200'
          }`}>
            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
            위험 {statusCounts.danger}
          </span>
        </div>
      )}
    </div>
  );
};

// 이 컴포넌트는 온도/전력 값이 아니라 설비 목록(id/이름/상태)만 실제로 사용하는데,
// equipments는 웹소켓 틱마다 새 배열로 갱신되어 매번 리렌더링(+무거운 차트 재계산)이 일어나던 것을
// id/이름/상태가 실제로 바뀔 때만 리렌더링하도록 막아서 렉을 줄임
const areEqual = (prev, next) => {
  if (prev.isDarkMode !== next.isDarkMode) return false;
  if (prev.equipments.length !== next.equipments.length) return false;
  for (let i = 0; i < prev.equipments.length; i++) {
    const a = prev.equipments[i];
    const b = next.equipments[i];
    if (a.equipId !== b.equipId || a.equipName !== b.equipName || a.status !== b.status || a.powerStatus !== b.powerStatus) return false;
  }
  return true;
};

export default memo(EquipmentTrendGrid, areEqual);
