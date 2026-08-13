import React, { useEffect, useRef, useState } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine, ReferenceDot,
} from 'recharts';
import { getRecentByEquipIdFromDB } from '../utils/indexedDb';

// 처음에 한 번에 미리 가져와 둘 최대 건수 (스크롤로 확대/축소할 때는 이 안에서 클라이언트에서만
// 잘라서 보여주므로 DB를 다시 조회하지 않음 -> 스크롤 중 렉이 생기지 않음)
const FETCH_LIMIT = 500;
// 처음 열었을 때 기본으로 보여줄 건수
const DEFAULT_VISIBLE = 80;
const MIN_VISIBLE = 20;
// 팝업이 열려있는 동안 이 주기로 IndexedDB를 다시 조회해서 실시간 수신 데이터를 반영함
const LIVE_REFRESH_MS = 2000;

// ==========================================
// 휠 스크롤로 독립적으로 확대/축소되는 단일 추이 차트
// (온도/전력 차트가 서로 다른 인스턴스로 렌더되므로 각자 따로 확대/축소됨)
// ==========================================
const TrendChart = ({ rawData, title, dotClass, color, dataKeyName, threshold, tooltipStyle, axisColor, gridColor, gradientId, isDarkMode, height = 180 }) => {
  const [visibleCount, setVisibleCount] = useState(() => Math.min(DEFAULT_VISIBLE, rawData.length) || DEFAULT_VISIBLE);
  const wheelAreaRef = useRef(null);

  useEffect(() => {
    const el = wheelAreaRef.current;
    if (!el) return;
    const handleWheel = (e) => {
      e.preventDefault();
      const dir = e.deltaY > 0 ? 1 : -1; // 아래로 스크롤 = 더 넓은 기간, 위로 스크롤 = 더 좁은 기간
      setVisibleCount(prev => {
        const step = Math.max(4, Math.round(prev * 0.15));
        const next = prev + dir * step;
        return Math.min(rawData.length || FETCH_LIMIT, Math.max(MIN_VISIBLE, next));
      });
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [rawData.length]);

  const chartData = rawData.slice(-visibleCount);
  const lastPoint = chartData[chartData.length - 1];

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${dotClass}`} />
          <span className={`text-[13px] font-bold ${isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-800'}`}>{title}</span>
        </div>
        <span className={`text-[10px] font-mono ${isDarkMode ? 'text-[#5C6584]' : 'text-gray-400'}`}>최근 {chartData.length}건</span>
      </div>
      <div ref={wheelAreaRef} className="select-none chart-reveal" style={{ cursor: 'ns-resize' }}>
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.4} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="time" tick={{ fontSize: 10, fill: axisColor }} tickLine={false} axisLine={{ stroke: gridColor }} minTickGap={30} />
            <YAxis tick={{ fontSize: 10, fill: axisColor }} tickLine={false} axisLine={false} width={36} />
            <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: axisColor }} />
            {threshold != null && (
              <ReferenceLine y={threshold} stroke={isDarkMode ? '#FBBF24' : '#D97706'} strokeDasharray="4 4"
                label={{ value: `임계값 ${threshold}`, position: 'insideTopRight', fontSize: 10, fill: isDarkMode ? '#FBBF24' : '#D97706' }} />
            )}
            <Area type="monotone" dataKey={dataKeyName} stroke={color} strokeWidth={2} fill={`url(#${gradientId})`} dot={false} name={title} isAnimationActive={false} />
            {/* 현재(가장 최근 수신) 위치를 굵은 점으로 표시 */}
            {lastPoint && lastPoint[dataKeyName] != null && (
              <ReferenceDot
                x={lastPoint.time}
                y={lastPoint[dataKeyName]}
                r={5}
                isFront
                ifOverflow="extendDomain"
                fill={color}
                stroke={isDarkMode ? '#12172A' : '#FFFFFF'}
                strokeWidth={2}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// ==========================================
// 설비 클릭 시 뜨는 온도/전력 히스토리 차트 팝업
// 브라우저에 누적된 실시간 데이터(IndexedDB liveData)를 그대로 사용 (백엔드 미사용)
// 각 차트 위에서 휠 스크롤하면 그 차트만 독립적으로 확대/축소됨
// ==========================================
// focusMetric: 'temperature' | 'power' | null
// null이면 그리드 행 클릭처럼 온도/전력 둘 다 보여주고, 지정되면 해당 그래프 하나만 크게 보여줌
const EquipmentHistoryModal = ({ equipId, equipName, threshold, onClose, isDarkMode, focusMetric = null }) => {
  const [rawData, setRawData] = useState([]); // 최근 FETCH_LIMIT건 (시간 오름차순, 가공된 형태)
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async (isInitial) => {
      if (isInitial) setIsLoading(true);
      try {
        const recent = await getRecentByEquipIdFromDB(equipId, FETCH_LIMIT);
        const mapped = recent
          .filter(item => item.receivedAt)
          .map(item => ({
            time: new Date(item.receivedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            temperature: item.temperature != null ? Number(Number(item.temperature).toFixed(1)) : null,
            power: item.power != null ? Number(Number(item.power).toFixed(1)) : null,
          }));
        if (!cancelled) setRawData(mapped);
      } catch (e) {
        console.error('설비 히스토리 조회 실패:', e);
      } finally {
        if (!cancelled && isInitial) setIsLoading(false);
      }
    };
    load(true);
    // 팝업이 떠 있는 동안 실시간으로 들어오는 새 데이터를 반영하기 위해 주기적으로 재조회
    const intervalId = setInterval(() => load(false), LIVE_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [equipId]);

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  const axisColor = isDarkMode ? '#5C6584' : '#9CA3AF';
  const gridColor = isDarkMode ? '#1E253D' : '#E5E7EB';
  const tooltipStyle = {
    backgroundColor: isDarkMode ? '#12172A' : '#FFFFFF',
    border: `1px solid ${isDarkMode ? '#232B45' : '#E5E7EB'}`,
    borderRadius: 10,
    fontSize: 12,
    boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
  };

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4"
      style={{
        backgroundColor: isDarkMode ? 'rgba(5, 8, 16, 0.75)' : 'rgba(0, 0, 0, 0.4)',
        backdropFilter: 'blur(3px)',
      }}
      onClick={handleOverlayClick}
    >
      <div
        className={`w-full max-w-[720px] rounded-2xl shadow-2xl border overflow-hidden transition-all ${
          isDarkMode ? 'bg-[#12172A] border-[#232B45]' : 'bg-white border-gray-200'
        }`}
      >
        {/* 헤더 */}
        <div className={`px-6 py-5 flex items-center justify-between border-b ${
          isDarkMode ? 'bg-[#0D1224] border-[#232B45] text-[#EDF1FC]' : 'bg-gray-50 border-gray-200 text-gray-800'
        }`}>
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#22D3EE] opacity-60"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#22D3EE]"></span>
            </span>
            <h2 className="text-[16px] font-bold tracking-tight m-0">{equipName || equipId}</h2>
            <span className={`text-[11px] font-mono px-2 py-0.5 rounded-full ${
              isDarkMode ? 'bg-[#1A2036] text-[#9FACC9]' : 'bg-gray-200 text-gray-600'
            }`}>
              {equipId}
            </span>
          </div>
          <button
            onClick={onClose}
            className={`text-2xl leading-none transition-colors outline-none bg-transparent border-none cursor-pointer ${
              isDarkMode ? 'text-[#7D87A8] hover:text-[#EDF1FC]' : 'text-gray-400 hover:text-gray-800'
            }`}
          >
            &times;
          </button>
        </div>

        {/* 본문 */}
        <div className="p-6 space-y-6">
          {isLoading ? (
            <div className={`h-[280px] flex items-center justify-center text-sm ${isDarkMode ? 'text-[#7D87A8]' : 'text-gray-400'}`}>
              불러오는 중...
            </div>
          ) : rawData.length === 0 ? (
            <div className={`h-[280px] flex flex-col items-center justify-center gap-2 text-sm ${isDarkMode ? 'text-[#7D87A8]' : 'text-gray-400'}`}>
              <svg className={`w-10 h-10 ${isDarkMode ? 'text-[#232B45]' : 'text-gray-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 3v18h18M9 17V9m4 8V5m4 12v-6" />
              </svg>
              아직 누적된 데이터가 없습니다.
            </div>
          ) : (
            <div className="space-y-6">
              {focusMetric !== 'power' && (
                <TrendChart
                  key={`temp-${equipId}`}
                  rawData={rawData}
                  title="온도 추이 (℃)"
                  dotClass={isDarkMode ? 'bg-[#FB5D75]' : 'bg-red-500'}
                  color={isDarkMode ? '#FB5D75' : '#EF4444'}
                  dataKeyName="temperature"
                  threshold={threshold}
                  tooltipStyle={tooltipStyle}
                  axisColor={axisColor}
                  gridColor={gridColor}
                  gradientId="tempGradient"
                  isDarkMode={isDarkMode}
                  height={focusMetric === 'temperature' ? 360 : 180}
                />
              )}
              {focusMetric !== 'temperature' && (
                <TrendChart
                  key={`power-${equipId}`}
                  rawData={rawData}
                  title="전력 추이"
                  dotClass={isDarkMode ? 'bg-[#22D3EE]' : 'bg-green-600'}
                  color={isDarkMode ? '#22D3EE' : '#16A34A'}
                  dataKeyName="power"
                  threshold={null}
                  tooltipStyle={tooltipStyle}
                  axisColor={axisColor}
                  gridColor={gridColor}
                  gradientId="powerGradient"
                  isDarkMode={isDarkMode}
                  height={focusMetric === 'power' ? 360 : 180}
                />
              )}

              <p className={`text-[11px] text-right ${isDarkMode ? 'text-[#5C6584]' : 'text-gray-400'}`}>
                {focusMetric
                  ? '차트 위에서 스크롤하면 기간이 확대/축소됩니다'
                  : '각 차트 위에서 스크롤하면 온도/전력 그래프가 각각 독립적으로 확대/축소됩니다'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EquipmentHistoryModal;
