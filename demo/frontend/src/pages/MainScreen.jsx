import React from 'react';
import Header from '../components/Header';

const MainScreen = ({ setRoute, user, openMyPage, isDarkMode, setIsDarkMode }) => {
  return (
    <div className={`h-screen max-h-[1080px] w-full min-w-[340px] flex flex-col overflow-y-auto transition-colors ${
      isDarkMode ? 'bg-[#0A0E1A]' : 'bg-gray-50'
    }`}>
      <Header 
        title="메인 메뉴" 
        user={user} 
        setRoute={setRoute} 
        openMyPage={openMyPage} 
        isDarkMode={isDarkMode} 
        setIsDarkMode={setIsDarkMode} 
      />
      
      <div className="flex-1 flex flex-col lg:flex-row items-center justify-center gap-8 p-6 lg:p-20 max-w-[1920px] mx-auto w-full">
        
        {/* 실시간 모니터링 카드 */}
        <div 
          onClick={() => setRoute('realtime')}
          className={`w-full max-w-[450px] h-[480px] rounded-2xl transition-all duration-300 cursor-pointer border flex flex-col items-center justify-center p-8 group relative overflow-hidden ${
            isDarkMode 
              ? 'bg-[#12172A] border-[#1E253D] hover:border-[#22D3EE]/50 hover:bg-[#161D35] hover:shadow-[0_0_30px_rgba(34,211,238,0.1)]' 
              : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-xl hover:-translate-y-1'
          }`}
        >
          <div className={`w-28 h-28 rounded-full flex items-center justify-center mb-8 transition-all duration-300 ${
            isDarkMode 
              ? 'bg-[#0D1224] text-[#22D3EE] border border-[#232B45] group-hover:bg-[#22D3EE] group-hover:text-[#0A0E1A] group-hover:shadow-[0_0_20px_rgba(34,211,238,0.4)]' 
              : 'bg-green-50 text-green-700 group-hover:bg-green-700 group-hover:text-white'
          }`}>
            <svg className="w-14 h-14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
            </svg>
          </div>
          <h2 className={`text-3xl font-bold mb-4 ${isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-800'}`}>
            실시간 모니터링
          </h2>
          <p className={`text-center leading-relaxed text-sm ${isDarkMode ? 'text-[#8592AD]' : 'text-gray-500'}`}>
            실시간으로 수집되는 설비 데이터를 모니터링하고 임계값을 설정하여 이상 징후를 감지합니다.
          </p>
        </div>

        {/* 시뮬레이션 모드 카드 */}
        <div 
          onClick={() => alert('시뮬레이션 모니터링 페이지는 다음 단계에서 구현됩니다.')}
          className={`w-full max-w-[450px] h-[480px] rounded-2xl transition-all duration-300 cursor-pointer border flex flex-col items-center justify-center p-8 group relative overflow-hidden ${
            isDarkMode 
              ? 'bg-[#12172A] border-[#1E253D] hover:border-[#34D399]/50 hover:bg-[#161D35] hover:shadow-[0_0_30px_rgba(52,211,153,0.1)]' 
              : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-xl hover:-translate-y-1'
          }`}
        >
          <div className={`w-28 h-28 rounded-full flex items-center justify-center mb-8 transition-all duration-300 ${
            isDarkMode 
              ? 'bg-[#0D1224] text-[#34D399] border border-[#232B45] group-hover:bg-[#34D399] group-hover:text-[#0A0E1A] group-hover:shadow-[0_0_20px_rgba(52,211,153,0.4)]' 
              : 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white'
          }`}>
            <svg className="w-14 h-14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
          </div>
          <h2 className={`text-3xl font-bold mb-4 ${isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-800'}`}>
            시뮬레이션 모드
          </h2>
          <p className={`text-center leading-relaxed text-sm ${isDarkMode ? 'text-[#8592AD]' : 'text-gray-500'}`}>
            과거 장애 이력 엑셀 파일을 업로드하여 상황을 재현하고 시나리오 데이터를 수정하여 테스트합니다.
          </p>
        </div>

      </div>
    </div>
  );
};

export default MainScreen;