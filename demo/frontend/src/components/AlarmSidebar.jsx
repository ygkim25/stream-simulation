import React from 'react';

// ==========================================
// 우측 알람 패널 컴포넌트
// ==========================================
const AlarmSidebar = ({ alarms, onClear, openLogs, selectedEquipName, onClearFilter }) => {
  return (
    <div className="w-full lg:w-[380px] xl:w-[420px] bg-white border border-gray-200 rounded-xl flex flex-col shadow-sm overflow-hidden shrink-0 min-h-0">
      
      {/* 상단 알람 헤더 영역 */}
      <div className="p-4 border-b border-gray-200 flex flex-col gap-3 bg-gray-50/80 shrink-0">
        <div className="flex items-center justify-between">
          <div className="font-bold text-gray-800 text-lg flex items-center gap-2">
            알람
            <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full font-semibold">
              {alarms.length}건
            </span>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={onClear} 
              className="px-3 py-1.5 border border-gray-300 hover:bg-gray-100 text-gray-700 rounded-full text-xs font-medium transition-colors cursor-pointer"
            >
              전체 지우기
            </button>
            <button 
              onClick={openLogs} 
              className="px-3 py-1.5 bg-gray-700 text-white hover:bg-gray-800 border-none rounded-full text-xs font-medium transition-colors cursor-pointer"
            >
              전체 로그
            </button>
          </div>
        </div>

        {/* 🚀 [추가됨] 필터링이 적용 중일 때만 나타나는 뱃지 */}
        {selectedEquipName && (
          <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2 animate-fade-in">
            <span className="text-xs font-bold text-green-800">
              📌 {selectedEquipName} 알람만 표시 중
            </span>
            <button 
              onClick={onClearFilter}
              className="text-green-600 hover:text-green-800 bg-green-100 hover:bg-green-200 px-2 py-1 rounded text-[10px] font-bold transition-colors cursor-pointer border-none"
            >
              필터 해제 ✕
            </button>
          </div>
        )}
      </div>

      {/* 알람 카드 리스트 영역 (내부 스크롤 담당) */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/30">
        {alarms.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-400 text-sm gap-2">
            <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path></svg>
            <span>{selectedEquipName ? '해당 설비에 대한 발생 알람이 없습니다.' : '감지된 이상 알람이 없습니다.'}</span>
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

      {/* 알람 건수 요약 뱃지 영역 (항상 바닥에 고정됨) */}
      <div className="p-3 border-t border-gray-200 bg-white flex justify-end gap-2 text-xs shrink-0 mt-auto">
        <span className="bg-amber-100 text-amber-800 px-3 py-1.5 rounded-full font-bold border border-amber-200">
          주의: {Math.floor(alarms.length * 1.5)}건
        </span>
        <span className="bg-red-100 text-red-700 px-3 py-1.5 rounded-full font-bold border border-red-200">
          경고: {alarms.length}건
        </span>
      </div>
    </div>
  );
};

export default AlarmSidebar;