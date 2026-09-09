import React, { useState, useEffect } from 'react';
import Header from '../components/Header';

// "나중에 하기" 클릭 시 다시 안 뜨게 할 기간 (24시간)
const DISMISS_DURATION_MS = 24 * 60 * 60 * 1000;

const MainScreen = ({ route, setRoute, user, openMyPage, isDarkMode, setIsDarkMode, isAlarmOn, setIsAlarmOn }) => {
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  // ★ 화면 진입 시 user 객체 내의 mustChangePassword 상태 체크
  useEffect(() => {
    // 1. Props로 받은 user 객체 확인, 없으면 sessionStorage에서 user 파싱
    const savedUserStr = sessionStorage.getItem('user');
    const currentUser = user || (savedUserStr ? JSON.parse(savedUserStr) : null);

    // 2. user 객체 안의 mustChangePassword 플래그 확인
    const mustChange = currentUser?.mustChangePassword;
    const isMustChange = mustChange === true || mustChange === 'true';

    if (!isMustChange) return;

    // 3. "나중에 하기"를 누른 지 24시간이 안 지났으면 다시 띄우지 않음
    const dismissKey = `pwChangeReminderDismissedAt_${currentUser?.userId || 'unknown'}`;
    const dismissedAt = Number(localStorage.getItem(dismissKey) || 0);
    if (Date.now() - dismissedAt < DISMISS_DURATION_MS) return;

    setShowPasswordModal(true);
  }, [user]);

  // "나중에 하기" 클릭 핸들러 - 24시간 동안 다시 뜨지 않도록 시각을 저장해둠
  const handleDismiss = () => {
    const savedUserStr = sessionStorage.getItem('user');
    const currentUser = user || (savedUserStr ? JSON.parse(savedUserStr) : null);
    const dismissKey = `pwChangeReminderDismissedAt_${currentUser?.userId || 'unknown'}`;
    localStorage.setItem(dismissKey, String(Date.now()));
    setShowPasswordModal(false);
  };

  // 비밀번호 변경 이동 핸들러
  const handleGoToChangePassword = () => {
    setShowPasswordModal(false);
    if (openMyPage) {
      openMyPage('password'); // 마이페이지 모달을 비밀번호 변경 탭으로 호출
    }
  };

  return (
    <div className={`h-[calc(100vh/1.1)] max-h-[calc(1080px/1.1)] w-full min-w-[340px] flex flex-col overflow-y-auto transition-colors ${
      isDarkMode ? 'bg-[#0A0E1A]' : 'bg-gray-50'
    }`}>
      <Header
        user={user}
        route={route}
        setRoute={setRoute}
        openMyPage={openMyPage}
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
        isAlarmOn={isAlarmOn}
        setIsAlarmOn={setIsAlarmOn}
      />
      
      <div className="flex-1 min-h-0 grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 p-4 lg:p-10 max-w-[1800px] mx-auto w-full">

        {/* 실시간 모니터링 카드 */}
        <div
          onClick={() => setRoute('realtime')}
          className={`w-full h-full min-h-0 rounded-2xl transition-all duration-300 cursor-pointer border flex flex-col items-center justify-center pb-6 lg:pb-10 p-4 lg:p-6 group relative overflow-hidden ${
            isDarkMode
              ? 'bg-[#12172A] border-[#1E253D] hover:border-[#22D3EE]/50 hover:bg-[#161D35] hover:shadow-[0_0_30px_rgba(34,211,238,0.1)]'
              : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-xl hover:-translate-y-1'
          }`}
        >
          <div className={`w-20 h-20 lg:w-28 lg:h-28 rounded-full flex items-center justify-center mb-4 lg:mb-6 transition-all duration-300 ${
            isDarkMode
              ? 'bg-[#0D1224] text-[#22D3EE] border border-[#232B45] group-hover:bg-[#22D3EE] group-hover:text-[#0A0E1A] group-hover:shadow-[0_0_20px_rgba(34,211,238,0.4)]'
              : 'bg-green-50 text-green-700 group-hover:bg-green-700 group-hover:text-white'
          }`}>
            <svg className="w-10 h-10 lg:w-14 lg:h-14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
            </svg>
          </div>
          <h2 className={`text-xl lg:text-3xl font-bold mb-2 text-center ${isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-800'}`}>
            실시간 모니터링
          </h2>
          <p className={`hidden lg:block text-center leading-relaxed text-xs px-5 ${isDarkMode ? 'text-[#9FACC9]' : 'text-gray-500'}`}>
            설비 데이터를 실시간으로 감시하고 이상 징후를 알려줍니다.
          </p>
        </div>

        {/* 시뮬레이션 모드 카드 */}
        <div
          onClick={() => setRoute('simulation')}
          className={`w-full h-full min-h-0 rounded-2xl transition-all duration-300 cursor-pointer border flex flex-col items-center justify-center pb-6 lg:pb-10 p-4 lg:p-6 group relative overflow-hidden ${
            isDarkMode
              ? 'bg-[#12172A] border-[#1E253D] hover:border-[#34D399]/50 hover:bg-[#161D35] hover:shadow-[0_0_30px_rgba(52,211,153,0.1)]'
              : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-xl hover:-translate-y-1'
          }`}
        >
          <div className={`w-20 h-20 lg:w-28 lg:h-28 rounded-full flex items-center justify-center mb-4 lg:mb-6 transition-all duration-300 ${
            isDarkMode
              ? 'bg-[#0D1224] text-[#34D399] border border-[#232B45] group-hover:bg-[#34D399] group-hover:text-[#0A0E1A] group-hover:shadow-[0_0_20px_rgba(52,211,153,0.4)]'
              : 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white'
          }`}>
            <svg className="w-10 h-10 lg:w-14 lg:h-14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
          </div>
          <h2 className={`text-xl lg:text-3xl font-bold mb-2 text-center ${isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-800'}`}>
            시뮬레이션
          </h2>
          <p className={`hidden lg:block text-center leading-relaxed text-xs px-5 ${isDarkMode ? 'text-[#9FACC9]' : 'text-gray-500'}`}>
            과거 장애를 재현하고 시나리오를 테스트합니다.
          </p>
        </div>

        {/* 설비 배치도 카드 */}
        <div
          onClick={() => setRoute('plantmap')}
          className={`w-full h-full min-h-0 rounded-2xl transition-all duration-300 cursor-pointer border flex flex-col items-center justify-center pb-6 lg:pb-10 p-4 lg:p-6 group relative overflow-hidden ${
            isDarkMode
              ? 'bg-[#12172A] border-[#1E253D] hover:border-amber-400/50 hover:bg-[#161D35] hover:shadow-[0_0_30px_rgba(251,191,36,0.1)]'
              : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-xl hover:-translate-y-1'
          }`}
        >
          <div className={`w-20 h-20 lg:w-28 lg:h-28 rounded-full flex items-center justify-center mb-4 lg:mb-6 transition-all duration-300 ${
            isDarkMode
              ? 'bg-[#0D1224] text-amber-400 border border-[#232B45] group-hover:bg-amber-400 group-hover:text-[#0A0E1A] group-hover:shadow-[0_0_20px_rgba(251,191,36,0.4)]'
              : 'bg-amber-50 text-amber-600 group-hover:bg-amber-600 group-hover:text-white'
          }`}>
            <svg className="w-10 h-10 lg:w-14 lg:h-14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
          </div>
          <h2 className={`text-xl lg:text-3xl font-bold mb-2 text-center ${isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-800'}`}>
            설비 배치도
          </h2>
          <p className={`hidden lg:block text-center leading-relaxed text-xs px-5 ${isDarkMode ? 'text-[#9FACC9]' : 'text-gray-500'}`}>
            도면 위에서 설비 상태를 한눈에 확인합니다.
          </p>
        </div>

        {/* 설비 통계 카드 */}
        <div
          onClick={() => setRoute('report')}
          className={`w-full h-full min-h-0 rounded-2xl transition-all duration-300 cursor-pointer border flex flex-col items-center justify-center pb-6 lg:pb-10 p-4 lg:p-6 group relative overflow-hidden ${
            isDarkMode
              ? 'bg-[#12172A] border-[#1E253D] hover:border-[#A78BFA]/50 hover:bg-[#161D35] hover:shadow-[0_0_30px_rgba(167,139,250,0.1)]'
              : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-xl hover:-translate-y-1'
          }`}
        >
          <div className={`w-20 h-20 lg:w-28 lg:h-28 rounded-full flex items-center justify-center mb-4 lg:mb-6 transition-all duration-300 ${
            isDarkMode
              ? 'bg-[#0D1224] text-[#A78BFA] border border-[#232B45] group-hover:bg-[#A78BFA] group-hover:text-[#0A0E1A] group-hover:shadow-[0_0_20px_rgba(167,139,250,0.4)]'
              : 'bg-violet-50 text-violet-600 group-hover:bg-violet-600 group-hover:text-white'
          }`}>
            <svg className="w-10 h-10 lg:w-14 lg:h-14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h2 className={`text-xl lg:text-3xl font-bold mb-2 text-center ${isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-800'}`}>
            설비 통계
          </h2>
          <p className={`hidden lg:block text-center leading-relaxed text-xs px-5 ${isDarkMode ? 'text-[#9FACC9]' : 'text-gray-500'}`}>
            기간별 설비 상태를 통계로 보여줍니다.
          </p>
        </div>

      </div>

      {/* 비밀번호 변경 권장 안내 모달 */}
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

            <p className={`text-sm mb-6 leading-relaxed ${isDarkMode ? 'text-[#9FACC9]' : 'text-gray-600'}`}>
              보안을 위해 비밀번호 변경이 권장되는 계정입니다.<br />
              원활한 시스템 이용을 위해 지금 비밀번호를 변경하시겠습니까?
            </p>

            <div className="flex justify-end gap-3">
              <button
                onClick={handleDismiss}
                className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                  isDarkMode 
                    ? 'bg-[#1A223D] text-[#9FACC9] hover:text-[#EDF1FC] hover:bg-[#232B45]' 
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                나중에 하기
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