import React from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, LabelList,
} from 'recharts';

const BAR_ROW_HEIGHT = 36;

// ==========================================
// 설비통계 TOP5 카드의 "+" 버튼으로 여는 전체 순위 그래프 - TOP5로 안 보이던 나머지 설비까지
// 같은 지표(온도/전력 위험 발생 횟수) 기준으로 전부 순위대로 보여줌
// ==========================================
const FullRankingModal = ({ title, data, dataKey, color, isDarkMode, onClose }) => {
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };
  const chartHeight = Math.max(data.length * BAR_ROW_HEIGHT, 120);

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4"
      style={{
        backgroundColor: isDarkMode ? 'rgba(5, 8, 16, 0.75)' : 'rgba(0, 0, 0, 0.4)',
        backdropFilter: 'blur(3px)',
      }}
      onClick={handleOverlayClick}
    >
      <div className={`w-full max-w-[560px] max-h-[80vh] rounded-2xl shadow-2xl border overflow-hidden flex flex-col transition-all ${
        isDarkMode ? 'bg-[#12172A] border-[#232B45]' : 'bg-white border-gray-200'
      }`}>
        <div className={`px-6 py-5 flex items-center justify-between border-b shrink-0 ${
          isDarkMode ? 'bg-[#0D1224] border-[#232B45] text-[#EDF1FC]' : 'bg-gray-50 border-gray-200 text-gray-800'
        }`}>
          <h2 className="text-[16px] font-bold tracking-tight m-0">{title} 전체 ({data.length}개)</h2>
          <button
            onClick={onClose}
            className={`text-2xl leading-none transition-colors outline-none bg-transparent border-none cursor-pointer ${
              isDarkMode ? 'text-[#7D87A8] hover:text-[#EDF1FC]' : 'text-gray-400 hover:text-gray-800'
            }`}
          >
            &times;
          </button>
        </div>

        <div className="p-6 overflow-y-auto" style={{ scrollbarGutter: 'stable' }}>
          {data.length === 0 ? (
            <div className={`h-[160px] flex items-center justify-center text-sm ${isDarkMode ? 'text-[#7D87A8]' : 'text-gray-400'}`}>
              이 기간에 위험 상태가 없었습니다.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={chartHeight} initialDimension={{ width: 480, height: chartHeight }}>
              <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 0 }}>
                <CartesianGrid stroke={isDarkMode ? '#1E253D' : '#E5E7EB'} strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12, fill: isDarkMode ? '#7D87A8' : '#6B7280' }} allowDecimals={false} />
                <YAxis type="category" dataKey="equipName" width={100} tick={{ fontSize: 13, fontWeight: 600, fill: isDarkMode ? '#DCE2F5' : '#1F2937' }} />
                <Tooltip
                  cursor={{ fill: isDarkMode ? '#151B30' : '#F9FAFB' }}
                  contentStyle={{
                    backgroundColor: isDarkMode ? '#12172A' : '#FFFFFF',
                    border: `1px solid ${isDarkMode ? '#232B45' : '#E5E7EB'}`,
                    borderRadius: 10, fontSize: 13,
                  }}
                  labelStyle={{ color: isDarkMode ? '#EDF1FC' : '#1F2937' }}
                  itemStyle={{ color: isDarkMode ? '#EDF1FC' : '#1F2937' }}
                />
                <Bar dataKey={dataKey} name="위험 횟수" radius={[0, 6, 6, 0]} barSize={20} isAnimationActive={false}>
                  {data.map(eq => (
                    <Cell key={eq.equipId} fill={color} />
                  ))}
                  <LabelList
                    dataKey={dataKey}
                    position="right"
                    isAnimationActive={false}
                    style={{ fontSize: 12, fontWeight: 700, fill: isDarkMode ? '#DCE2F5' : '#374151' }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
};

export default FullRankingModal;
