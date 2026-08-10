import React, { useState } from 'react';

const Header = ({ title, user, setRoute, openMyPage, isDarkMode, setIsDarkMode }) => {
  const [isAlarmOn, setIsAlarmOn] = useState(true);
  const isAdmin = user?.role === 'ADMIN' || user?.userId === 'admin';
  return (
    <header className={`h-[64px] border-b flex items-center justify-between px-6 shrink-0 transition-colors ${
      isDarkMode 
        ? 'bg-[#0D1224] border-[#232B45] text-[#EDF1FC]' 
        : 'bg-white border-gray-200 text-gray-800 shadow-sm'
    }`}>
      <div className="flex items-center gap-4">
        <h1
          className="flex items-center gap-2.5 text-[15px] font-bold tracking-tight cursor-pointer group"
          onClick={() => setRoute('main')}
        >
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#34D399] opacity-60"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#34D399]"></span>
          </span>
          <span className={isDarkMode ? 'group-hover:text-[#22D3EE] transition-colors' : 'group-hover:text-green-600 transition-colors'}>
            모의 관제 시스템
          </span>
        </h1>
        {title && (
          <span className={`text-[13px] border-l pl-4 font-medium hidden sm:inline-block tracking-wide ${
            isDarkMode ? 'border-[#232B45] text-[#9FACC9]' : 'border-gray-200 text-gray-500'
          }`}>
            {title}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        {/* 다크 / 라이트 모드 토글 버튼 */}
        <button
          onClick={() => setIsDarkMode(!isDarkMode)}
          className={`p-2 rounded-lg border transition-colors flex items-center justify-center ${
            isDarkMode 
              ? 'bg-[#151B30] border-[#232B45] text-[#22D3EE] hover:bg-[#1A223D]' 
              : 'bg-gray-100 border-gray-300 text-gray-600 hover:bg-gray-200'
          }`}
          title={isDarkMode ? '라이트 모드로 변경' : '다크 모드로 변경'}
        >
          {isDarkMode ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          )}
        </button>

        {/* 알람 on/off 토글 버튼 (관리자 전용) */}
        {isAdmin && (
          <button
            onClick={() => setIsAlarmOn(!isAlarmOn)}
            className={`p-2 rounded-lg border transition-colors flex items-center justify-center ${
              isDarkMode
                ? 'bg-[#151B30] border-[#232B45] text-[#22D3EE] hover:bg-[#1A223D]'
                : 'bg-gray-100 border-gray-300 text-gray-600 hover:bg-gray-200'
            }`}
            title={isAlarmOn ? '알람 끄기' : '알람 켜기'}
          >
            {isAlarmOn ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.143 17.082a24.248 24.248 0 003.844.148m-3.844-.148a23.856 23.856 0 01-5.455-1.31 8.964 8.964 0 002.3-5.542m3.155 6.852a3 3 0 005.667 1.97m1.965-2.277L21 21m-4.225-4.225a23.81 23.81 0 003.536-1.003A8.967 8.967 0 0118 9.75V9A6 6 0 006.53 5.66m8.75 8.75L6.53 5.66m0 0L3 3" />
              </svg>
            )}
          </button>
        )}

        {/* 내 정보 메뉴 */}
        <div
          className={`flex items-center gap-3 cursor-pointer px-2.5 py-1.5 rounded-lg transition-colors border ${
            isDarkMode 
              ? 'hover:bg-[#151B30] border-transparent hover:border-[#232B45]' 
              : 'hover:bg-gray-100 border-transparent hover:border-gray-200'
          }`}
          onClick={() => openMyPage()}
        >
          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 font-mono border ${
            isDarkMode 
              ? 'bg-[#1A2036] border-[#2A335A] text-[#22D3EE]' 
              : 'bg-green-100 border-green-200 text-green-700'
          }`}>
            {user?.userName ? user.userName.charAt(0) : '관'}
          </div>
          <div className="flex flex-col leading-tight">
            {/* 이름 + 직급 (오른쪽 작게) */}
            <div className="flex items-baseline gap-1.5">
              <span className={`text-[13px] font-bold ${isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-800'}`}>
                {user?.userName || '사용자'}
              </span>
              {user?.responsibility && (
                <span className={`text-[11px] font-normal ${isDarkMode ? 'text-[#9FACC9]' : 'text-gray-500'}`}>
                  {user.responsibility}
                </span>
              )}
            </div>
            {/* 부서명 */}
            <span className={`text-[11px] font-mono ${isDarkMode ? 'text-[#7D87A8]' : 'text-gray-500'}`}>
              {user?.divisionName || '관제팀'}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;