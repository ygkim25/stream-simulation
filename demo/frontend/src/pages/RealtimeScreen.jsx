import React, { useState } from 'react';
import Header from '../components/Header';
import AlarmSidebar from '../components/AlarmSidebar';

// ==========================================
// 실시간 모니터링 화면 컴포넌트
// ==========================================
const RealtimeScreen = ({ user, setRoute, openMyPage, alarms, setAlarms, openLogs }) => {
  const [tabMode, setTabMode] = useState('stream');
  const [time, setTime] = useState(new Date('2026-07-29T15:15:00'));

  const [equipments] = useState([
    { id: 'EQ-001', name: '메인 펌프 A', location: '1구역 / 설비1팀', current: 75.2, threshold: 80 },
    { id: 'EQ-002', name: '냉각 팬 B', location: '1구역 / 설비1팀', current: 65.0, threshold: 60 },
    { id: 'EQ-003', name: '보조 발전기 C', location: '2구역 / 설비2팀', current: 42.1, threshold: 90 },
    { id: 'EQ-004', name: '압축기 D', location: '3구역 / 설비3팀', current: 105.8, threshold: 100 },
    { id: 'EQ-005', name: '열교환기 E', location: '3구역 / 설비3팀', current: 31.4, threshold: 50 },
  ]);

  const adjustTime = (minutes) => {
    setTime(new Date(time.getTime() + minutes * 60000));
  };

  const handleExport = () => {
    alert('현재 그리드 데이터를 엑셀 파일로 다운로드합니다.');
  };

  return (
    <div className="min-h-screen w-full min-w-[340px] flex flex-col bg-gray-50">
      <Header title="실시간 모니터링" user={user} setRoute={setRoute} openMyPage={openMyPage} />

      <div className="flex-1 p-4 sm:p-6 flex flex-col gap-4 max-w-[1920px] mx-auto w-full overflow-hidden">
        
        {/* 상단 컨트롤 영역 */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-3 sm:p-4 rounded-xl border border-gray-200 shadow-sm shrink-0">
          <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-full border border-gray-200">
            <button 
              onClick={() => setTabMode('stream')}
              className={`px-6 py-2 rounded-full text-sm font-bold transition-all ${
                tabMode === 'stream' 
                  ? 'bg-green-800 text-white shadow-sm' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              실시간 스트림
            </button>
            <button 
              onClick={() => setTabMode('threshold')}
              className={`px-6 py-2 rounded-full text-sm font-bold transition-all ${
                tabMode === 'threshold' 
                  ? 'bg-green-800 text-white shadow-sm' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              임계값설정
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center border border-gray-300 rounded-full overflow-hidden bg-white shadow-sm">
              <button 
                onClick={() => adjustTime(-10)} 
                className="w-8 h-8 bg-green-700 text-white flex items-center justify-center font-bold text-lg hover:bg-green-800 transition-colors"
              >
                -
              </button>
              <div className="px-4 py-1.5 text-xs sm:text-sm font-mono font-bold text-gray-700">
                {time.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
              </div>
              <button 
                onClick={() => adjustTime(10)} 
                className="w-8 h-8 bg-green-700 text-white flex items-center justify-center font-bold text-lg hover:bg-green-800 transition-colors"
              >
                +
              </button>
            </div>

            <button 
              onClick={handleExport}
              className="px-5 py-2 border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-full text-sm font-semibold transition-colors shadow-sm flex items-center gap-1.5"
            >
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path>
              </svg>
              내보내기
            </button>
          </div>
        </div>

        {/* 본문 콘텐츠 영역 */}
        <div className="flex-1 flex flex-col lg:flex-row gap-4 min-h-0 overflow-hidden">
          
          <div className="flex-1 bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col overflow-hidden min-h-[400px]">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-100 h-[40px]">
              <h3 className="font-bold text-gray-800 text-lg">
                {tabMode === 'stream' ? '설비별 실시간 수치 모니터링' : '설비 임계값 설정'}
              </h3>
              
              <div className="flex items-center gap-4">
                {tabMode === 'threshold' && (
                  <button 
                    onClick={() => {
                      alert('입력한 임계값이 저장되었습니다.');
                      setTabMode('stream');
                    }} 
                    className="px-4 py-1.5 bg-green-700 hover:bg-green-800 text-white rounded text-sm font-bold shadow-sm transition-colors"
                  >
                    저장
                  </button>
                )}
                <span className="text-xs text-gray-400">마지막 동기화: 실시간 수신 중</span>
              </div>
            </div>

            <div className="flex-1 overflow-auto">
              <table className="w-full text-left border-collapse table-fixed min-w-[700px]">
                <thead className="bg-gray-50 sticky top-0 text-gray-600 text-sm z-10">
                  <tr className="h-[48px]">
                    <th className="w-[12%] px-3.5 border-b border-gray-200 font-semibold align-middle">설비 ID</th>
                    <th className="w-[20%] px-3.5 border-b border-gray-200 font-semibold align-middle">설비명</th>
                    <th className="w-[28%] px-3.5 border-b border-gray-200 font-semibold align-middle">위치 / 담당팀</th>
                    <th className="w-[15%] px-3.5 border-b border-gray-200 font-semibold align-middle">현재 수치</th>
                    <th className="w-[15%] px-3.5 border-b border-gray-200 font-semibold align-middle">설정 임계값</th>
                    <th className="w-[10%] px-3.5 border-b border-gray-200 font-semibold text-center align-middle">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
                  {equipments.map((eq) => {
                    const isOver = eq.current > eq.threshold;
                    return (
                      <tr key={eq.id} className="h-[56px] hover:bg-gray-50/80 transition-colors">
                        <td className="px-3.5 font-mono text-gray-500 truncate align-middle">{eq.id}</td>
                        <td className="px-3.5 font-bold text-gray-800 truncate align-middle">{eq.name}</td>
                        <td className="px-3.5 text-gray-500 truncate align-middle">{eq.location}</td>
                        <td className="px-3.5 align-middle">
                          <span className={`font-mono font-bold px-2 py-1 ${isOver ? 'text-red-600 bg-red-50/50 rounded' : 'text-green-700'}`}>
                            {eq.current.toFixed(1)}
                          </span>
                        </td>
                        <td className="px-3.5 font-mono align-middle">
                          {tabMode === 'threshold' ? (
                            <input 
                              type="number" 
                              defaultValue={eq.threshold}
                              className="w-[80px] h-[34px] border border-gray-300 rounded px-2 bg-amber-50/50 focus:outline-none focus:border-green-600 transition-all text-center"
                            />
                          ) : (
                            <span className="inline-flex items-center h-[34px] px-2">{eq.threshold}</span>
                          )}
                        </td>
                        <td className="px-3.5 text-center align-middle">
                          {isOver ? (
                            <span className="bg-red-100 text-red-700 px-2.5 py-1 rounded-full text-xs font-bold inline-block whitespace-nowrap">
                              임계치 초과
                            </span>
                          ) : (
                            <span className="bg-green-100 text-green-700 px-2.5 py-1 rounded-full text-xs font-bold inline-block whitespace-nowrap">
                              정상
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <AlarmSidebar 
            alarms={alarms} 
            onClear={() => setAlarms([])} 
            openLogs={openLogs} // 전달받은 함수를 Sidebar의 onClick 속성으로 연결
          />
        </div>
      </div>
    </div>
  );
};

export default RealtimeScreen;