import React from 'react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts';

// ==========================================
// 시뮬레이션 재생 중 선택한 설비의 온도/전력 추이를 실시간으로 그려주는 차트
// (재생 위치가 앞으로 갈수록 선이 이어져 그려지고, 셀 값을 수정하면 그 지점에서 바로 꺾여서
//  "값을 바꾸면 이런 현상이 일어난다"는 인과관계가 눈에 보이게 함)
// ==========================================
const SimulationTrendChart = ({ data, threshold, equipName, isDarkMode }) => {
  const axisColor = isDarkMode ? '#5C6584' : '#9CA3AF';
  const gridColor = isDarkMode ? '#1E253D' : '#E5E7EB';
  const tooltipStyle = {
    backgroundColor: isDarkMode ? '#12172A' : '#FFFFFF',
    border: `1px solid ${isDarkMode ? '#232B45' : '#E5E7EB'}`,
    borderRadius: 10,
    fontSize: 11,
  };

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
        <ResponsiveContainer width="100%" height={120}>
          <AreaChart data={data} margin={{ top: 4, right: 8, left: -14, bottom: 0 }}>
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
            {threshold != null && (
              <ReferenceLine y={threshold} stroke={isDarkMode ? '#FBBF24' : '#D97706'} strokeDasharray="4 4" />
            )}
            <Area type="monotone" dataKey="temperature" stroke={isDarkMode ? '#FB5D75' : '#EF4444'} strokeWidth={2} fill="url(#simTempGradient)" dot={false} isAnimationActive={false} name="온도" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <span className={`w-2 h-2 rounded-full ${isDarkMode ? 'bg-[#22D3EE]' : 'bg-green-600'}`} />
          <span className={`text-[12px] font-bold ${isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-800'}`}>{equipName} · 전력</span>
        </div>
        <ResponsiveContainer width="100%" height={120}>
          <AreaChart data={data} margin={{ top: 4, right: 8, left: -14, bottom: 0 }}>
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
            <Area type="monotone" dataKey="power" stroke={isDarkMode ? '#22D3EE' : '#16A34A'} strokeWidth={2} fill="url(#simPowerGradient)" dot={false} isAnimationActive={false} name="전력" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default SimulationTrendChart;
