import React, { useEffect, useRef, useState } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceDot,
} from 'recharts';

// 경고 마커의 실제 화면 좌표를 재는 훅. recharts 내부 이벤트(activeIndex 등)에 기대지 않고,
// 렌더링된 원(circle.recharts-reference-dot-dot)의 위치를 직접 읽어서 그 위에 일반 <button>을
// 올려놓는 방식 - 브라우저 네이티브 버튼이라 hover 커서/클릭이 백퍼센트 동작함.
// chartRef(차트 전용, 우리가 그리는 버튼은 안 들어있음)를 관찰해서 버튼 자신의 재렌더링이
// MutationObserver를 다시 트리거하는 무한루프를 피함. 좌표는 positionRef 기준으로 계산.
const areRectsEqual = (a, b) => a.length === b.length && a.every((r, i) => r.left === b[i].left && r.top === b[i].top);

// getBoundingClientRect()는 항상 화면에 실제로 렌더링된(= zoom 배율이 곱해진) 픽셀 값을 돌려주는데,
// 그 값을 그대로 절대 위치 버튼의 left/top에 넣으면 CSS가 거기에 zoom을 한 번 더 곱해버려서
// 원점에서 멀어질수록 오른쪽/아래로 밀리는 오차가 생김 (앱 전체에 html { zoom: 1.1 }이 걸려 있음)
// -> 측정한 델타를 zoom 배율로 나눠서 다시 로컬(비-zoom) 좌표로 되돌려줌
const getZoomFactor = () => {
  const z = parseFloat(getComputedStyle(document.documentElement).zoom);
  return Number.isFinite(z) && z > 0 ? z : 1;
};

const useWarningDotPositions = (positionRef, chartRef, refreshKey) => {
  const [rects, setRects] = useState([]);
  useEffect(() => {
    const chartEl = chartRef.current;
    const posEl = positionRef.current;
    if (!chartEl || !posEl) return undefined;
    const recompute = () => {
      const zoom = getZoomFactor();
      const posRect = posEl.getBoundingClientRect();
      // 원 위치 계산은 "경고 마커"에만 적용 (현재 위치를 나타내는 별도 점은 클릭 대상이 아님)
      const circles = chartEl.querySelectorAll('.warning-ref-dot circle.recharts-reference-dot-dot');
      const next = Array.from(circles).map(c => {
        const r = c.getBoundingClientRect();
        return {
          left: (r.left - posRect.left + r.width / 2) / zoom,
          top: (r.top - posRect.top + r.height / 2) / zoom,
        };
      });
      setRects(prev => (areRectsEqual(prev, next) ? prev : next));
    };
    recompute();
    // recharts는 ReferenceDot을 별도 zIndex 포털로 렌더링해서 최초 마운트 시
    // 한 프레임 늦게 DOM에 붙는 경우가 있음 -> MutationObserver로 그 시점도 잡아줌.
    // attributes:true도 필요함 - 마커를 클릭해 재생 위치가 바뀌면 같은 경고 지점(같은 key라 DOM
    // 노드는 재사용됨)이 바뀐 x축 범위 때문에 화면상 다른 좌표로 옮겨가는데, 이때는 노드 추가/삭제
    // 없이 cx/cy 속성만 바뀌므로 childList만 보면 이 변화를 놓쳐서 버튼이 예전 좌표에 남아있게 됨
    // (그래서 클릭이 씹히는 것처럼 보였음)
    const mo = new MutationObserver(recompute);
    // attributeFilter로 cx/cy만 보게 좁혀서, 툴팁 hover 등 차트 내 다른 속성 변화까지 매번
    // recompute가 돌지 않게 함 (안 그러면 마우스만 움직여도 계속 재계산됨)
    mo.observe(chartEl, { childList: true, subtree: true, attributes: true, attributeFilter: ['cx', 'cy'] });
    const ro = new ResizeObserver(recompute);
    ro.observe(chartEl);
    return () => {
      mo.disconnect();
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);
  return rects;
};

const WARNING_HIT_SIZE = 22;
// 휠 확대/축소 시 기본으로 보여줄 건수 / 최소로 줄일 수 있는 건수
const DEFAULT_VISIBLE = 80;
const MIN_VISIBLE = 20;

// 휠 스크롤로 그래프에 보이는 구간(최근 N건)을 확대/축소함. 온도/전력 차트가 서로 다른 인스턴스라
// 각자 독립적으로 확대/축소됨 (EquipmentHistoryModal의 확대/축소와 동일한 방식)
const useZoomWindow = (fullLength, elRef) => {
  const [visibleCount, setVisibleCount] = useState(() => Math.min(DEFAULT_VISIBLE, fullLength) || DEFAULT_VISIBLE);
  // 사용자가 휠로 직접 확대/축소하기 전까지는 표시 건수를 재생이 진행되며 늘어나는 데이터에 맞춰 같이 늘림
  const hasUserZoomedRef = useRef(false);

  useEffect(() => {
    if (!hasUserZoomedRef.current) {
      setVisibleCount(Math.min(DEFAULT_VISIBLE, fullLength) || DEFAULT_VISIBLE);
    }
  }, [fullLength]);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return undefined;
    const handleWheel = (e) => {
      e.preventDefault();
      hasUserZoomedRef.current = true;
      const dir = e.deltaY > 0 ? 1 : -1; // 아래로 스크롤 = 더 넓은 구간, 위로 스크롤 = 더 좁은 구간
      setVisibleCount(prev => {
        const step = Math.max(4, Math.round(prev * 0.15));
        const next = prev + dir * step;
        return Math.min(fullLength || DEFAULT_VISIBLE, Math.max(MIN_VISIBLE, next));
      });
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [fullLength, elRef]);

  return visibleCount;
};

// ==========================================
// 시뮬레이션 재생 중 선택한 설비의 온도/전력 추이를 실시간으로 그려주는 차트
// (재생 위치가 앞으로 갈수록 선이 이어져 그려지고, 셀 값을 수정하면 그 지점에서 바로 꺾여서
//  "값을 바꾸면 이런 현상이 일어난다"는 인과관계가 눈에 보이게 함)
// ==========================================
const SimulationTrendChart = ({ data, equipName, isDarkMode, onPointClick, showTemperature = true, showPower = true }) => {
  const axisColor = isDarkMode ? '#5C6584' : '#9CA3AF';
  const gridColor = isDarkMode ? '#1E253D' : '#E5E7EB';
  const thresholdColor = isDarkMode ? '#FBBF24' : '#D97706';
  const tooltipStyle = {
    backgroundColor: isDarkMode ? '#12172A' : '#FFFFFF',
    border: `1px solid ${isDarkMode ? '#232B45' : '#E5E7EB'}`,
    borderRadius: 10,
    fontSize: 11,
  };

  // 임계값 점선의 맨 끝(가장 최근 값)에만 숫자를 표시함 (chartData는 확대/축소로 잘린 배열이라
  // 온도/전력 차트마다 길이가 다를 수 있어서 파라미터로 받음)
  const makeThresholdEndLabel = (color, chartData) => (props) => {
    const { x, y, index, value } = props;
    if (value == null || index !== chartData.length - 1) return null;
    return (
      <text x={x + 4} y={y} dy={4} fontSize={10} fontWeight="bold" fill={color}>
        {value}
      </text>
    );
  };

  // 경고/위험이 새로 발생한 지점에만 원 마커를 표시함
  const warnColor = isDarkMode ? '#FBBF24' : '#D97706';

  // 현재 재생 위치(=화면에 보이는 구간의 마지막 지점)를 굵은 점으로 표시
  const renderCurrentDot = (chartData, valueKey, color) => {
    const lastPoint = chartData[chartData.length - 1];
    return (
      <ReferenceDot
        x={lastPoint.elapsedMs}
        y={lastPoint[valueKey]}
        r={5}
        isFront
        ifOverflow="extendDomain"
        fill={color}
        stroke={isDarkMode ? '#12172A' : '#FFFFFF'}
        strokeWidth={2}
      />
    );
  };
  const renderWarningDots = (warningPoints, valueKey) => warningPoints.map(p => (
    <ReferenceDot
      key={`warn-${valueKey}-${p.elapsedMs}`}
      className="warning-ref-dot"
      x={p.elapsedMs}
      y={p[valueKey]}
      r={4}
      isFront
      ifOverflow="extendDomain"
      fill={warnColor}
      stroke={isDarkMode ? '#12172A' : '#FFFFFF'}
      strokeWidth={1.5}
    />
  ));

  const tempOuterRef = useRef(null);
  const tempChartRef = useRef(null);
  const powerOuterRef = useRef(null);
  const powerChartRef = useRef(null);

  const tempVisibleCount = useZoomWindow(data.length, tempOuterRef);
  const powerVisibleCount = useZoomWindow(data.length, powerOuterRef);
  const tempChartData = data.slice(-tempVisibleCount);
  const powerChartData = data.slice(-powerVisibleCount);

  const tempWarningPoints = tempChartData.filter(d => d.isWarning);
  const powerWarningPoints = powerChartData.filter(d => d.isWarning);

  // X축은 elapsedMs(숫자, 항상 유일함) 기준으로 그림 - 표시용 "time"(HH:mm:ss) 문자열은 초 단위라
  // 재생 속도가 빠르면 같은 초 안에 여러 지점이 몰려 값이 겹치는데, 문자열 카테고리 축을 쓰면
  // 겹치는 값들의 위치를 구분 못해서 경고 마커가 전부 맨 왼쪽으로 쏠려버리는 문제가 있었음
  const tempTimeByElapsed = new Map(tempChartData.map(d => [d.elapsedMs, d.time]));
  const powerTimeByElapsed = new Map(powerChartData.map(d => [d.elapsedMs, d.time]));
  const tempTickFormatter = (ms) => tempTimeByElapsed.get(ms) ?? '';
  const powerTickFormatter = (ms) => powerTimeByElapsed.get(ms) ?? '';
  const tempDotRects = useWarningDotPositions(tempOuterRef, tempChartRef, `${tempChartData.length}-${tempWarningPoints.length}`);
  const powerDotRects = useWarningDotPositions(powerOuterRef, powerChartRef, `${powerChartData.length}-${powerWarningPoints.length}`);

  const renderClickTargets = (rects, warningPoints) => rects.map((r, i) => (
    <button
      key={`hit-${i}`}
      type="button"
      title="클릭하면 이 시점으로 재생 위치가 이동합니다"
      onClick={() => onPointClick && warningPoints[i] && onPointClick(warningPoints[i].elapsedMs)}
      style={{
        position: 'absolute',
        left: r.left - WARNING_HIT_SIZE / 2,
        top: r.top - WARNING_HIT_SIZE / 2,
        width: WARNING_HIT_SIZE,
        height: WARNING_HIT_SIZE,
        borderRadius: '9999px',
        background: 'transparent',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
      }}
    />
  ));

  if (!equipName) {
    return (
      <div className={`h-[150px] flex items-center justify-center text-xs ${isDarkMode ? 'text-[#5C6584]' : 'text-gray-400'}`}>
        표에서 설비를 클릭하면 실시간 추이 그래프가 표시됩니다
      </div>
    );
  }

  if (data.length < 2) {
    return (
      <div className={`h-[150px] flex items-center justify-center text-xs ${isDarkMode ? 'text-[#5C6584]' : 'text-gray-400'}`}>
        재생하면 {equipName}의 추이가 실시간으로 그려집니다
      </div>
    );
  }

  return (
    <div className={`grid grid-cols-1 gap-4 ${showTemperature && showPower ? 'md:grid-cols-2' : ''}`}>
      {showTemperature && (
      <div>
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isDarkMode ? 'bg-[#FB5D75]' : 'bg-red-500'}`} />
            <span className={`text-[12px] font-bold ${isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-800'}`}>{equipName} · 온도 (℃)</span>
          </div>
          <span className={`text-[10px] font-mono ${isDarkMode ? 'text-[#5C6584]' : 'text-gray-400'}`}>최근 {tempChartData.length}건</span>
        </div>
        <div className="relative select-none" ref={tempOuterRef} style={{ cursor: 'ns-resize' }}>
          <div ref={tempChartRef}>
            <ResponsiveContainer width="100%" height={120}>
              <AreaChart data={tempChartData} margin={{ top: 4, right: 40, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="simTempGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={isDarkMode ? '#FB5D75' : '#EF4444'} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={isDarkMode ? '#FB5D75' : '#EF4444'} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="elapsedMs" type="number" domain={['dataMin', 'dataMax']} tickFormatter={tempTickFormatter} tick={{ fontSize: 9, fill: axisColor }} tickLine={false} axisLine={{ stroke: gridColor }} minTickGap={30} />
                <YAxis tick={{ fontSize: 9, fill: axisColor }} tickLine={false} axisLine={false} width={30} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: axisColor }} labelFormatter={tempTickFormatter} />
                <Line type="stepAfter" dataKey="threshold" stroke={thresholdColor} strokeWidth={1.5} strokeDasharray="4 4" dot={false} isAnimationActive={false} label={makeThresholdEndLabel(thresholdColor, tempChartData)} name="임계값" />
                <Area type="monotone" dataKey="temperature" stroke={isDarkMode ? '#FB5D75' : '#EF4444'} strokeWidth={2} fill="url(#simTempGradient)" dot={false} isAnimationActive={false} name="온도" />
                {renderWarningDots(tempWarningPoints, 'temperature')}
                {renderCurrentDot(tempChartData, 'temperature', isDarkMode ? '#FB5D75' : '#EF4444')}
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {renderClickTargets(tempDotRects, tempWarningPoints)}
        </div>
      </div>
      )}

      {showPower && (
      <div>
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isDarkMode ? 'bg-[#22D3EE]' : 'bg-green-600'}`} />
            <span className={`text-[12px] font-bold ${isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-800'}`}>{equipName} · 전력</span>
          </div>
          <span className={`text-[10px] font-mono ${isDarkMode ? 'text-[#5C6584]' : 'text-gray-400'}`}>최근 {powerChartData.length}건</span>
        </div>
        <div className="relative select-none" ref={powerOuterRef} style={{ cursor: 'ns-resize' }}>
          <div ref={powerChartRef}>
            <ResponsiveContainer width="100%" height={120}>
              <AreaChart data={powerChartData} margin={{ top: 4, right: 40, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="simPowerGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={isDarkMode ? '#22D3EE' : '#16A34A'} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={isDarkMode ? '#22D3EE' : '#16A34A'} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="elapsedMs" type="number" domain={['dataMin', 'dataMax']} tickFormatter={powerTickFormatter} tick={{ fontSize: 9, fill: axisColor }} tickLine={false} axisLine={{ stroke: gridColor }} minTickGap={30} />
                <YAxis tick={{ fontSize: 9, fill: axisColor }} tickLine={false} axisLine={false} width={30} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: axisColor }} labelFormatter={powerTickFormatter} />
                <Line type="stepAfter" dataKey="powerThreshold" stroke={thresholdColor} strokeWidth={1.5} strokeDasharray="4 4" dot={false} isAnimationActive={false} label={makeThresholdEndLabel(thresholdColor, powerChartData)} name="임계값(전력)" />
                <Area type="monotone" dataKey="power" stroke={isDarkMode ? '#22D3EE' : '#16A34A'} strokeWidth={2} fill="url(#simPowerGradient)" dot={false} isAnimationActive={false} name="전력" />
                {renderWarningDots(powerWarningPoints, 'power')}
                {renderCurrentDot(powerChartData, 'power', isDarkMode ? '#22D3EE' : '#16A34A')}
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {renderClickTargets(powerDotRects, powerWarningPoints)}
        </div>
      </div>
      )}
    </div>
  );
};

export default SimulationTrendChart;
