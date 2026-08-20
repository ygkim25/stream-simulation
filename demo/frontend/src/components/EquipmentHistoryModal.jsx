import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine, ReferenceDot,
} from 'recharts';
import { getRecentByEquipIdFromDB } from '../utils/indexedDb';
import { formatClockTime } from '../utils/simulationParse';
import LoadingSpinner from './LoadingSpinner';

// 처음에 한 번에 미리 가져와 둘 최대 건수 (스크롤로 확대/축소할 때는 이 안에서 클라이언트에서만
// 잘라서 보여주므로 DB를 다시 조회하지 않음 -> 스크롤 중 렉이 생기지 않음)
const FETCH_LIMIT = 500;
// 처음 열었을 때 기본으로 보여줄 건수
const DEFAULT_VISIBLE = 80;
const MIN_VISIBLE = 20;
// 팝업이 열려있는 동안 이 주기로 IndexedDB를 다시 조회해서 실시간 수신 데이터를 반영함
const LIVE_REFRESH_MS = 2000;

// 설비별 온도 추이 카드(EquipmentTrendGrid)가 이미 최근 데이터를 localStorage에 캐싱해두고
// 있어서(같은 키를 그대로 공유), 이 팝업을 열 때 IndexedDB 조회가 끝나길 기다리지 않고
// 그 캐시를 즉시 초기값으로 씀 - 카드가 이미 화면에 보이던 설비라면 사실상 즉시 그려짐
const TREND_CACHE_KEY = 'equipmentTrendHistoryCache';
const loadCachedEquipHistory = (equipId) => {
  try {
    const all = JSON.parse(localStorage.getItem(TREND_CACHE_KEY));
    return (all && all[equipId]) || null;
  } catch {
    return null;
  }
};
const mapRecords = (recent) => recent
  .filter(item => item.receivedAt)
  .map(item => ({
    time: formatClockTime(new Date(item.receivedAt)),
    temperature: item.temperature != null ? Number(Number(item.temperature).toFixed(1)) : null,
    power: item.power != null ? Number(Number(item.power).toFixed(1)) : null,
  }));

// ==========================================
// 휠 스크롤로 독립적으로 확대/축소되는 단일 추이 차트
// (온도/전력 차트가 서로 다른 인스턴스로 렌더되므로 각자 따로 확대/축소됨)
// ==========================================
const TrendChart = ({ rawData, title, dotClass, color, dataKeyName, threshold, tooltipStyle, axisColor, gridColor, gradientId, isDarkMode, height = 180 }) => {
  // 온도/전력이 완전히 분리된 레코드로 저장되다 보니, rawData에는 이 지표 값이 없는(다른
  // 지표 전용) 레코드도 섞여 있음. 그걸 그대로 Area의 dataKey에 넘기면 recharts가 null
  // 지점마다 영역을 0까지 닫아버려서 선이 뾰족뾰족한 막대처럼 끊겨 보임 -> 이 지표 값이
  // 실제로 있는 레코드만 걸러서 끊김 없는 배열로 만들어 사용
  const metricData = rawData.filter(item => item[dataKeyName] != null);

  // 항상 MIN_VISIBLE(가장 좁은 폭)로 고정해두고 그 안에서 실제 데이터로 채움(slice는 배열
  // 길이를 넘는 개수를 요청해도 있는 만큼만 반환하므로 문제없음) - 데이터가 캐시(적음) ->
  // 실제 조회(많음)로 몇 번 갱신되는 동안 보이는 구간 폭 자체가 따라 늘어나며 "갑자기 확
  // 넓어지는" 것처럼 보이는 걸 막음. 사용자가 휠로 직접 조정한 뒤에는 그 값을 그대로 유지함
  const [visibleCount, setVisibleCount] = useState(MIN_VISIBLE);
  const wheelAreaRef = useRef(null);

  // 모달을 열자마자(캐시로 즉시 그려진 뒤) 바로 이어서 DEFAULT_VISIBLE -> FETCH_LIMIT 순으로
  // 데이터가 짧은 간격으로 몇 번 더 갱신되는데, 이 리스너가 metricData.length에 걸려 있으면 그때마다
  // 떼었다 다시 붙어서 그 순간 들어온 휠 이벤트가 씹혀 "스크롤이 안 먹는" 것처럼 보였음. 리스너는
  // 마운트 시 한 번만 붙이고, 최신 길이는 ref로 읽어서 데이터가 몇 번을 갱신되도 끊기지 않게 함
  const metricDataLengthRef = useRef(metricData.length);
  useEffect(() => {
    metricDataLengthRef.current = metricData.length;
  }, [metricData.length]);

  // useEffect는 브라우저가 이미 한 번 그린 뒤에(paint 후) 실행돼서, 캐시로 즉시 그려진 차트에
  // 마우스가 이미 올라가 있다가 바로 스크롤하면 그 첫 틱이 리스너가 붙기 전이라 씹힐 수 있었음.
  // useLayoutEffect는 그리기 전에(paint 전) 동기적으로 실행되므로 이 틈이 없음
  useLayoutEffect(() => {
    const el = wheelAreaRef.current;
    if (!el) return;
    const handleWheel = (e) => {
      e.preventDefault();
      const dir = e.deltaY > 0 ? 1 : -1; // 아래로 스크롤 = 더 넓은 기간, 위로 스크롤 = 더 좁은 기간
      setVisibleCount(prev => {
        const step = Math.max(4, Math.round(prev * 0.15));
        const next = prev + dir * step;
        return Math.min(metricDataLengthRef.current || FETCH_LIMIT, Math.max(MIN_VISIBLE, next));
      });
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  const chartData = metricData.slice(-visibleCount);
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
      {/* chart-reveal(선이 그려지는 900ms 연출)을 빼서 데이터가 오자마자 바로 그려지게 함 -
          이 연출 때문에 실제로 로딩이 끝났는데도 아직 로딩 중인 것처럼 느껴졌음 */}
      <div ref={wheelAreaRef} className="select-none" style={{ cursor: 'ns-resize' }}>
        {/* initialDimension 없이는 ResizeObserver로 실제 크기를 잴 때까지 빈 화면이라, 모달을
            열자마자 바로 그려지지 않고 한 박자 늦게 뜨는 것처럼 보였음 */}
        <ResponsiveContainer width="100%" height={height} initialDimension={{ width: 660, height }}>
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
const EquipmentHistoryModal = ({ equipId, equipName, threshold, powerThreshold, onClose, isDarkMode, focusMetric = null }) => {
  // 온도추이 카드 캐시가 있으면 IndexedDB 조회를 기다리지 않고 바로 그 데이터로 시작 -
  // 카드가 이미 떠 있던 설비라면 사실상 로딩 없이 즉시 그려짐
  const [rawData, setRawData] = useState(() => {
    const cached = loadCachedEquipHistory(equipId);
    return cached ? mapRecords(cached) : [];
  });
  const [isLoading, setIsLoading] = useState(() => loadCachedEquipHistory(equipId) === null);

  useEffect(() => {
    let cancelled = false;
    const load = async (limit) => {
      const recent = await getRecentByEquipIdFromDB(equipId, limit);
      if (!cancelled) setRawData(mapRecords(recent));
    };
    // 처음 열 때는 화면에 실제로 보이는 만큼(DEFAULT_VISIBLE)만 우선 조회해서 최대한 빨리 그려주고,
    // 스크롤로 확대할 때 쓸 나머지(FETCH_LIMIT까지)는 첫 화면이 뜬 뒤 백그라운드에서 이어받음
    (async () => {
      try {
        await load(DEFAULT_VISIBLE);
      } catch (e) {
        console.error('설비 히스토리 조회 실패:', e);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
      if (cancelled) return;
      load(FETCH_LIMIT).catch(e => console.error('설비 히스토리 전체 조회 실패:', e));
    })();
    // 팝업이 떠 있는 동안 실시간으로 들어오는 새 데이터를 반영하기 위해 주기적으로 재조회
    const intervalId = setInterval(() => load(FETCH_LIMIT).catch(e => console.error('설비 히스토리 재조회 실패:', e)), LIVE_REFRESH_MS);
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
            <div className="h-[280px] flex items-center justify-center">
              <LoadingSpinner size="md" isDarkMode={isDarkMode} label="불러오는 중..." />
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
                  threshold={powerThreshold}
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
