import React from 'react';
import Header from '../components/Header';

// ==========================================
// 메인 메뉴 화면 컴포넌트
// ==========================================
const MainScreen = ({ setRoute, user, openMyPage }) => {
  return (
    // min-w-[340px] 추가: 화면이 340px보다 작아지면 찌그러지지 않도록 보호
    <div className="min-h-screen w-full min-w-[340px] flex flex-col bg-gray-50">
      <Header title="메인 메뉴" user={user} setRoute={setRoute} openMyPage={openMyPage} />
      
      <div className="flex-1 flex flex-col lg:flex-row items-center justify-center gap-8 p-6 lg:p-20 max-w-[1920px] mx-auto w-full">
        <div 
          onClick={() => setRoute('realtime')}
          className="w-full max-w-[450px] h-[480px] bg-white rounded-2xl shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer border border-gray-200 flex flex-col items-center justify-center p-8 group"
        >
          <div className="w-28 h-28 bg-green-50 text-green-700 rounded-full flex items-center justify-center mb-8 group-hover:bg-green-700 group-hover:text-white transition-all duration-300">
            <svg className="w-14 h-14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
            </svg>
          </div>
          <h2 className="text-3xl font-bold text-gray-800 mb-4">실시간 모니터링</h2>
          <p className="text-gray-500 text-center leading-relaxed">
            실시간으로 수집되는 설비 데이터를 모니터링하고 임계값을 설정하여 이상 징후를 감지합니다.
          </p>
        </div>

        <div 
          onClick={() => alert('시뮬레이션 모니터링 페이지는 다음 단계에서 구현됩니다.')}
          className="w-full max-w-[450px] h-[480px] bg-white rounded-2xl shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer border border-gray-200 flex flex-col items-center justify-center p-8 group"
        >
          <div className="w-28 h-28 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mb-8 group-hover:bg-emerald-600 group-hover:text-white transition-all duration-300">
            <svg className="w-14 h-14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
          </div>
          <h2 className="text-3xl font-bold text-gray-800 mb-4">시뮬레이션 모드</h2>
          <p className="text-gray-500 text-center leading-relaxed">
            과거 장애 이력 엑셀 파일을 업로드하여 상황을 재현하고 시나리오 데이터를 수정하여 테스트합니다.
          </p>
        </div>
      </div>
    </div>
  );
};

export default MainScreen;