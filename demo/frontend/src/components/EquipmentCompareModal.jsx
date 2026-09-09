import React, { useEffect, useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { getRecentByEquipIdFromDB } from '../utils/indexedDb';
import { formatClockTime } from '../utils/simulationParse';
import LoadingSpinner from './LoadingSpinner';

const FETCH_LIMIT = 200;
// 겹쳐 그릴 선 색상 - 순환해서 씀(설비가 이보다 많이 선택되면 색이 반복됨)
const LINE_COLORS = ['#22D3EE', '#FB5D75', '#34D399', '#FBBF24', '#A78BFA', '#38BDF8'];
// 서로 다른 설비의 수신 시각을 1초 단위로 반올림해서 같은 시점끼리 한 행으로 묶음
// (이 프로젝트의 시뮬레이션 틱이 설비들 사이에 공유되므로 대체로 잘 맞아떨어짐)
const BUCKET_MS = 1000;

// ==========================================
// 여러 설비를 선택해서 한 차트에 겹쳐보는 비교 팝업
// EquipmentHistoryModal과 동일하게 IndexedDB(liveData)의 로컬 기록만 사용 (백엔드 미사용)
// ==========================================
const EquipmentCompareModal = ({ equipIds, equipments, metricTab, onClose, isDarkMode }) => {
  const [seriesByEquip, setSeriesByEquip] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      const results = await Promise.all(equipIds.map(id => getRecentByEquipIdFromDB(id, FETCH_LIMIT)));
      if (cancelled) return;
      const next = {};
      equipIds.forEach((id, i) => {
        next[id] = (results[i] || [])
          .filter(r => r.receivedAt && (metricTab === 'temperature' ? r.temperature != null : r.power != null))
          .map(r => ({
            receivedAtMs: new Date(r.receivedAt).getTime(),
            value: metricTab === 'temperature' ? r.temperature : r.power,
          }));
      });
      setSeriesByEquip(next);
      setIsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [equipIds, metricTab]);

  // {equipId: [...]} 여러 설비 기록을 시각(1초 단위) 기준으로 한 행씩으로 합침 -
  // 한 행에 그 시각 각 설비의 값이 컬럼(equipId)으로 들어가서 Line 여러 개가 같은 x축을 공유함
  const mergedData = (() => {
    const rows = new Map();
    equipIds.forEach(id => {
      (seriesByEquip[id] || []).forEach(({ receivedAtMs, value }) => {
        const key = Math.round(receivedAtMs / BUCKET_MS) * BUCKET_MS;
        if (!rows.has(key)) rows.set(key, { ts: key, time: formatClockTime(new Date(key)) });
        rows.get(key)[id] = Number(Number(value).toFixed(1));
      });
    });
    return [...rows.values()].sort((a, b) => a.ts - b.ts);
  })();

  const hasAnyData = mergedData.length > 0;
  const axisColor = isDarkMode ? '#5C6584' : '#9CA3AF';
  const gridColor = isDarkMode ? '#1E253D' : '#E5E7EB';
  const tooltipStyle = {
    backgroundColor: isDarkMode ? '#12172A' : '#FFFFFF',
    border: `1px solid ${isDarkMode ? '#232B45' : '#E5E7EB'}`,
    borderRadius: 10,
    fontSize: 12,
    boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) onClose();
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
      <div className={`w-full max-w-[820px] rounded-2xl shadow-2xl border overflow-hidden transition-all ${
        isDarkMode ? 'bg-[#12172A] border-[#232B45]' : 'bg-white border-gray-200'
      }`}>
        <div className={`px-6 py-5 flex items-center justify-between border-b ${
          isDarkMode ? 'bg-[#0D1224] border-[#232B45] text-[#EDF1FC]' : 'bg-gray-50 border-gray-200 text-gray-800'
        }`}>
          <h2 className="text-[16px] font-bold tracking-tight m-0">
            설비 비교 ({equipIds.length}개) · {metricTab === 'temperature' ? '온도' : '전력'}
          </h2>
          <button
            onClick={onClose}
            className={`text-2xl leading-none transition-colors outline-none bg-transparent border-none cursor-pointer ${
              isDarkMode ? 'text-[#7D87A8] hover:text-[#EDF1FC]' : 'text-gray-400 hover:text-gray-800'
            }`}
          >
            &times;
          </button>
        </div>

        <div className="p-6">
          {isLoading ? (
            <div className="h-[360px] flex items-center justify-center">
              <LoadingSpinner size="md" isDarkMode={isDarkMode} label="불러오는 중..." />
            </div>
          ) : !hasAnyData ? (
            <div className={`h-[360px] flex items-center justify-center text-sm ${isDarkMode ? 'text-[#7D87A8]' : 'text-gray-400'}`}>
              아직 누적된 데이터가 없습니다.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={360} initialDimension={{ width: 760, height: 360 }}>
              <LineChart data={mergedData} margin={{ top: 5, right: 20, left: -10, bottom: 0 }}>
                <CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: axisColor }} tickLine={false} axisLine={{ stroke: gridColor }} minTickGap={30} />
                <YAxis tick={{ fontSize: 10, fill: axisColor }} tickLine={false} axisLine={false} width={40} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: axisColor }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {equipIds.map((id, i) => {
                  const equipName = equipments.find(eq => eq.equipId === id)?.equipName || id;
                  return (
                    <Line
                      key={id}
                      type="monotone"
                      dataKey={id}
                      name={equipName}
                      stroke={LINE_COLORS[i % LINE_COLORS.length]}
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
};

export default EquipmentCompareModal;
