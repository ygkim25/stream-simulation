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
    // 한 프레임 늦게 DOM에 붙는 경우가 있음 -> MutationObserver로 그 시점도 잡아줌
    const mo = new MutationObserver(recompute);
    mo.observe(chartEl, { childList: true, subtree: true });
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

// ==========================================
// 시뮬레이션 재생 중 선택한 설비의 온도/전력 추이를 실시간으로 그려주는 차트
// (재생 위치가 앞으로 갈수록 선이 이어져 그려지고, 셀 값을 수정하면 그 지점에서 바로 꺾여서
//  "값을 바꾸면 이런 현상이 일어난다"는 인과관계가 눈에 보이게 함)
// ==========================================
const SimulationTrendChart = ({ data, equipName, isDarkMode, onPointClick }) => {
  const axisColor = isDarkMode ? '#5C6584' : '#9CA3AF';
  const gridColor = isDarkMode ? '#1E253D' : '#E5E7EB';
  const thresholdColor = isDarkMode ? '#FBBF24' : '#D97706';
  const tooltipStyle = {
    backgroundColor: isDarkMode ? '#12172A' : '#FFFFFF',
    border: `1px solid ${isDarkMode ? '#232B45' : '#E5E7EB'}`,
    borderRadius: 10,
    fontSize: 11,
  };

  // 임계값 점선의 맨 끝(가장 최근 값)에만 숫자를 표시함
  const makeThresholdEndLabel = (color) => (props) => {
    const { x, y, index, value } = props;
    if (value == null || index !== data.length - 1) return null;
    return (
      <text x={x + 4} y={y} dy={4} fontSize={10} fontWeight="bold" fill={color}>
        {value}
      </text>
    );
  };

  // 경고/위험이 새로 발생한 지점에만 원 마커를 표시함
  const warnColor = isDarkMode ? '#FBBF24' : '#D97706';
  const warningPoints = data.filter(d => d.isWarning);

  // 현재 재생 위치(=데이터의 마지막 지점)를 굵은 점으로 표시
  const lastPoint = data[data.length - 1];
  const renderCurrentDot = (valueKey, color) => (
    <ReferenceDot
      x={lastPoint.time}
      y={lastPoint[valueKey]}
      r={5}
      isFront
      ifOverflow="extendDomain"
      fill={color}
      stroke={isDarkMode ? '#12172A' : '#FFFFFF'}
      strokeWidth={2}
    />
  );
  const renderWarningDots = (valueKey) => warningPoints.map(p => (
    <ReferenceDot
      key={`warn-${valueKey}-${p.elapsedMs}`}
      className="warning-ref-dot"
      x={p.time}
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
  const refreshKey = `${data.length}-${warningPoints.length}`;
  const tempDotRects = useWarningDotPositions(tempOuterRef, tempChartRef, refreshKey);
  const powerDotRects = useWarningDotPositions(powerOuterRef, powerChartRef, refreshKey);

  const renderClickTargets = (rects) => rects.map((r, i) => (
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
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <span className={`w-2 h-2 rounded-full ${isDarkMode ? 'bg-[#FB5D75]' : 'bg-red-500'}`} />
          <span className={`text-[12px] font-bold ${isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-800'}`}>{equipName} · 온도 (℃)</span>
        </div>
        <div className="relative" ref={tempOuterRef}>
          <div ref={tempChartRef}>
            <ResponsiveContainer width="100%" height={120}>
              <AreaChart data={data} margin={{ top: 4, right: 26, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="simTempGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={isDarkMode ? '#FB5D75' : '#EF4444'} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={isDarkMode ? '#FB5D75' : '#EF4444'} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="time" tick={{ fontSize: 9, fill: axisColor }} tickLine={false} axisLine={{ stroke: gridColor }} minTickGap={30} />
                <YAxis tick={{ fontSize: 9, fill: axisColor }} tickLine={false} axisLine={false} width={30} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: axisColor }} />
                <Line type="stepAfter" dataKey="threshold" stroke={thresholdColor} strokeWidth={1.5} strokeDasharray="4 4" dot={false} isAnimationActive={false} label={makeThresholdEndLabel(thresholdColor)} name="임계값" />
                <Area type="monotone" dataKey="temperature" stroke={isDarkMode ? '#FB5D75' : '#EF4444'} strokeWidth={2} fill="url(#simTempGradient)" dot={false} isAnimationActive={false} name="온도" />
                {renderWarningDots('temperature')}
                {renderCurrentDot('temperature', isDarkMode ? '#FB5D75' : '#EF4444')}
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {renderClickTargets(tempDotRects)}
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <span className={`w-2 h-2 rounded-full ${isDarkMode ? 'bg-[#22D3EE]' : 'bg-green-600'}`} />
          <span className={`text-[12px] font-bold ${isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-800'}`}>{equipName} · 전력</span>
        </div>
        <div className="relative" ref={powerOuterRef}>
          <div ref={powerChartRef}>
            <ResponsiveContainer width="100%" height={120}>
              <AreaChart data={data} margin={{ top: 4, right: 26, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="simPowerGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={isDarkMode ? '#22D3EE' : '#16A34A'} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={isDarkMode ? '#22D3EE' : '#16A34A'} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="time" tick={{ fontSize: 9, fill: axisColor }} tickLine={false} axisLine={{ stroke: gridColor }} minTickGap={30} />
                <YAxis tick={{ fontSize: 9, fill: axisColor }} tickLine={false} axisLine={false} width={30} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: axisColor }} />
                <Line type="stepAfter" dataKey="powerThreshold" stroke={thresholdColor} strokeWidth={1.5} strokeDasharray="4 4" dot={false} isAnimationActive={false} label={makeThresholdEndLabel(thresholdColor)} name="임계값(전력)" />
                <Area type="monotone" dataKey="power" stroke={isDarkMode ? '#22D3EE' : '#16A34A'} strokeWidth={2} fill="url(#simPowerGradient)" dot={false} isAnimationActive={false} name="전력" />
                {renderWarningDots('power')}
                {renderCurrentDot('power', isDarkMode ? '#22D3EE' : '#16A34A')}
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {renderClickTargets(powerDotRects)}
        </div>
      </div>
    </div>
  );
};

export default SimulationTrendChart;
