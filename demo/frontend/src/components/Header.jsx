import React from 'react';

// ==========================================
// 공통 헤더 컴포넌트
// ==========================================
const Header = ({ title, user, setRoute, openMyPage }) => {
  return (
    <header className="h-[70px] bg-green-800 text-white flex items-center justify-between px-6 shadow-md shrink-0">
      <div className="flex items-center gap-4">
        <h1 
          className="text-xl font-bold cursor-pointer hover:text-green-200 transition-colors"
          onClick={() => setRoute('main')}
        >
          모의 관제 시스템
        </h1>
        {title && (
          <span className="text-base border-l border-green-600 pl-4 text-green-100 hidden sm:inline-block">
            {title}
          </span>
        )}
      </div>
      
      {/* 로그인상태 / 메뉴 */}
      <div 
        className="flex items-center gap-3 cursor-pointer hover:bg-green-700/60 p-2 rounded-lg transition-colors border border-transparent hover:border-green-600" 
        onClick={openMyPage}
      >
        <div className="w-9 h-9 bg-white text-green-800 rounded-full flex items-center justify-center font-bold text-base shrink-0 shadow-sm">
          {user ? user.name.charAt(0) : '관'}
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-bold leading-tight">{user ? user.name : '홍길동'}</span>
          <span className="text-xs text-green-200">{user ? user.dept : '관제1팀'}</span>
        </div>
      </div>
    </header>
  );
};

export default Header;