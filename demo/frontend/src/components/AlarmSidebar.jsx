import React from 'react';

// ==========================================
// 우측 알람 패널 컴포넌트
// ==========================================
const AlarmSidebar = ({ alarms, onClear, openLogs }) => {
  return (
    <div className="w-full lg:w-[380px] xl:w-[420px] bg-white border border-gray-200 rounded-xl flex flex-col h-[600px] lg:h-full shadow-sm overflow-hidden shrink-0">
      {/* 알람 상단 헤더 */}
      <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-gray-50/80">
        <div className="font-bold text-gray-800 text-lg flex items-center gap-2">
          알람
          <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full font-semibold">
            {alarms.length}건
          </span>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={onClear} 
            className="px-3 py-1.5 border border-gray-300 hover:bg-gray-100 text-gray-700 rounded-full text-xs font-medium transition-colors"
          >
            지우기
          </button>
          <button 
            onClick={openLogs} 
            className="px-3 py-1.5 border border-gray-300 hover:bg-gray-100 text-gray-700 rounded-full text-xs font-medium transition-colors"
          >
            로그
          </button>
        </div>
      </div>

      {/* 알람 카드 리스트 영역 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/30">
        {alarms.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-400 text-sm">
            <span>감지된 이상 알람이 없습니다.</span>
          </div>
        ) : (
          alarms.map(alarm => (
            <div key={alarm.id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:border-red-300 transition-all flex flex-col gap-1.5">
              <div className="flex justify-between items-center">
                <span className="font-bold text-red-600 text-sm flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                  {alarm.equipName}
                </span>
                <span className="text-xs text-gray-400 font-mono">{alarm.time}</span>
              </div>
              <p className="text-xs text-gray-600 font-medium">
                임계치 초과: <span className="text-red-500 font-bold">{alarm.value}</span> / 기준 <span className="text-gray-700">{alarm.threshold}</span>
              </p>
              <span className="text-[11px] text-gray-400">위치: {alarm.location}</span>
            </div>
          ))
        )}
      </div>

      {/* 알람 건수 요약 뱃지 영역 */}
      <div className="p-3 border-t border-gray-200 bg-white flex justify-end gap-2 text-xs">
        <span className="bg-amber-100 text-amber-800 px-3 py-1.5 rounded-full font-bold border border-amber-200">
          12건
        </span>
        <span className="bg-red-100 text-red-700 px-3 py-1.5 rounded-full font-bold border border-red-200">
          6건
        </span>
      </div>
    </div>
  );
};

export default AlarmSidebar;