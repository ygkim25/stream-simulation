import React, { useState, useEffect } from 'react';
import Header from '../components/Header';

const MainScreen = ({ setRoute, user, openMyPage, isDarkMode, setIsDarkMode }) => {
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  // ★ 화면 진입 시 비밀번호 변경 필요 여부 & 24시간 팝업 차단 여부 체크
  useEffect(() => {
    const mustChange = sessionStorage.getItem('mustChangePassword');
    const hideUntil = localStorage.getItem('hidePasswordModalUntil');
    const now = Date.now();

    // 1. mustChangePassword 상태 확인
    const isMustChange = mustChange === 'true' || mustChange === true;
    
    // 2. 24시간 숨김 기한이 설정되지 않았거나 이미 지난 경우
    const isExpired = !hideUntil || now > Number(hideUntil);

    if (isMustChange && isExpired) {
      setShowPasswordModal(true);
    }
  }, []);

  // ★ "나중에 하기 (하루 동안 보지 않기)" 클릭 핸들러
  const handleDismissForADay = () => {
    const ONE_DAY_MS = 24 * 60 * 60 * 1000; // 24시간 (밀리초)
    const hideUntil = Date.now() + ONE_DAY_MS;

    localStorage.setItem('hidePasswordModalUntil', hideUntil.toString());
    setShowPasswordModal(false);
  };

  // 비밀번호 변경 이동 핸들러
  const handleGoToChangePassword = () => {
    setShowPasswordModal(false);
    if (openMyPage) {
      openMyPage(); // 기존 마이페이지 모달 호출
    }
  };

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

      {/* ★ 비밀번호 변경 권장 안내 모달 */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl transition-all ${
            isDarkMode ? 'bg-[#12172A] border-[#232B45] text-[#EDF1FC]' : 'bg-white border-gray-200 text-gray-900'
          }`}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold">비밀번호 변경 안내</h3>
            </div>

            <p className={`text-sm mb-6 leading-relaxed ${isDarkMode ? 'text-[#8592AD]' : 'text-gray-600'}`}>
              보안을 위해 비밀번호 변경이 권장되는 계정입니다.<br />
              원활한 시스템 이용을 위해 지금 비밀번호를 변경하시겠습니까?
            </p>

            <div className="flex justify-end gap-3">
              <button
                onClick={handleDismissForADay}
                className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                  isDarkMode 
                    ? 'bg-[#1A223D] text-[#8592AD] hover:text-[#EDF1FC] hover:bg-[#232B45]' 
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                24시간 동안 보지 않기
              </button>
              <button
                onClick={handleGoToChangePassword}
                className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  isDarkMode 
                    ? 'bg-[#22D3EE] hover:bg-[#3FDCF0] text-[#0A0E1A] shadow-[0_0_15px_rgba(34,211,238,0.2)]' 
                    : 'bg-green-700 hover:bg-green-800 text-white'
                }`}
              >
                지금 변경하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MainScreen;