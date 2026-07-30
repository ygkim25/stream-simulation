import React, { useEffect, useRef } from 'react';

// ==========================================
// 전체 로그 팝업 컴포넌트
// ==========================================
const FullLogModal = ({ logs, onClear, onClose }) => {
  // 스크롤바를 맨 아래로 자동 이동시키기 위한 Ref
  const scrollRef = useRef(null);

  // 팝업이 열리거나 logs 데이터가 변경될 때마다 맨 아래로 스크롤
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  // 배경 클릭 시 모달 닫기
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    // 최상단 오버레이
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        minWidth: '340px',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px' 
      }}
      onClick={handleOverlayClick}
    >
      {/* 팝업 창 컨테이너 */}
      <div 
        className="bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col h-[80vh] max-h-[800px]"
        style={{
          width: '100%',
          maxWidth: '700px',
          minWidth: '340px', 
          position: 'relative',
          zIndex: 100000
        }}
      >
        
        {/* 상단 헤더 영역 */}
        <div className="bg-gray-800 text-white px-6 py-5 flex items-center justify-between shrink-0 shadow-sm z-10">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold tracking-wide m-0">전체 로그 이력</h2>
            <span className="bg-gray-700 text-gray-300 text-xs px-2.5 py-1 rounded-full font-mono">
              총 {logs.length}건
            </span>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => {
                if(window.confirm('전체 로그 이력을 삭제하시겠습니까?')) {
                  onClear();
                }
              }}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded shadow-sm transition-colors flex items-center gap-1 cursor-pointer border-none"
              disabled={logs.length === 0}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
              지우기
            </button>
            <button 
              onClick={onClose} 
              className="text-gray-400 hover:text-white text-3xl leading-none transition-colors outline-none bg-transparent border-none cursor-pointer"
            >
              &times;
            </button>
          </div>
        </div>

        {/* 팝업 본문 (로그 리스트 영역) - 위에서부터 쌓이고 스크롤 생성 */}
        <div 
          ref={scrollRef} 
          className="flex-1 overflow-y-auto p-0 bg-gray-50 flex flex-col justify-start"
        >
          {logs.length > 0 ? (
            <div className="divide-y divide-gray-200">
              {logs.map((log) => (
                <div key={log.id} className="p-4 sm:p-5 hover:bg-white transition-colors bg-white/50 flex flex-col sm:flex-row gap-2 sm:gap-4 items-start sm:items-center">
                  
                  {/* 시간 및 타입 배지 */}
                  <div className="flex items-center gap-3 min-w-[140px]">
                    <span className="font-mono text-gray-500 text-sm font-semibold">{log.time}</span>
                    {log.type === 'warning' && <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-xs font-bold border border-red-200">초과 감지</span>}
                    {log.type === 'info' && <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-bold border border-blue-200">시스템 정보</span>}
                    {log.type === 'success' && <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs font-bold border border-green-200">정상 복구</span>}
                  </div>

                  {/* 로그 내용 */}
                  <div className="flex-1">
                    <p className="text-gray-800 text-sm sm:text-base font-medium m-0 leading-relaxed">
                      <span className="font-bold text-gray-900 mr-2">{log.equipName || '시스템'}</span>
                      {log.message}
                    </p>
                  </div>

                  {/* 수치 데이터 (있는 경우) */}
                  {log.value && log.threshold && (
                    <div className="bg-gray-100 px-3 py-1.5 rounded-lg border border-gray-200 shrink-0 text-right min-w-[120px]">
                       <div className="text-xs text-gray-500 font-bold mb-0.5">수치 / 임계값</div>
                       <div className="font-mono font-bold text-sm">
                         <span className="text-red-600">{log.value}</span> <span className="text-gray-400">/</span> <span>{log.threshold}</span>
                       </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
             <div className="h-full flex flex-col items-center justify-center text-gray-400 p-8 text-center gap-3">
              <svg className="w-12 h-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
              </svg>
              <p className="font-medium text-lg m-0">기록된 로그 이력이 없습니다.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FullLogModal;