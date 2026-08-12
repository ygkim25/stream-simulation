import React, { useState } from 'react';
import axios from 'axios';

const LoginScreen = ({ onLogin, isDarkMode, setIsDarkMode }) => {
  // 자동로그인 체크 시 저장해둔 아이디/비밀번호를 화면에 미리 채워둠
  const [id, setId] = useState(() => localStorage.getItem('savedLoginId') || '');
  const [pw, setPw] = useState(() => localStorage.getItem('savedLoginPw') || '');
  const [rememberLogin, setRememberLogin] = useState(() => localStorage.getItem('savedLoginId') !== null);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');

    if (!id.trim() || !pw.trim()) {
      setError('아이디와 비밀번호를 입력해 주세요.');
      return;
    }

    setIsLoading(true);

    const loginData = {
      userId: id.trim(),
      password: pw.trim()
    };

    try {
      const response = await axios.post('http://localhost:8086/api/auth/login', loginData);
      
      const { 
        token, 
        userId: resUserId, 
        userName, 
        divisionName, 
        responsibility, 
        role, 
        mustChangePassword 
      } = response.data;

      // 유저 정보
      const userData = {
        token,
        userId: resUserId,
        userName,
        divisionName,
        responsibility,
        role,
        mustChangePassword
      };

      sessionStorage.setItem('user', JSON.stringify(userData));

      // 자동로그인 체크 여부에 따라 아이디/비밀번호 저장 또는 삭제
      if (rememberLogin) {
        localStorage.setItem('savedLoginId', loginData.userId);
        localStorage.setItem('savedLoginPw', loginData.password);
      } else {
        localStorage.removeItem('savedLoginId');
        localStorage.removeItem('savedLoginPw');
      }

      if (onLogin) {
        onLogin(userData);
      }
    } catch (err) {
      if (err.response) {
        const serverMessage = typeof err.response.data === 'string'
          ? err.response.data
          : err.response.data?.message;

        setError(serverMessage || `[${err.response.status}] 로그인 처리 중 서버 에러가 발생했습니다.`);
      } else {
        setError('서버와 통신할 수 없습니다. 백엔드(8086 포트) 상태를 확인하세요.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`h-[calc(100vh/1.1)] max-h-[calc(1080px/1.1)] w-full min-w-[340px] flex flex-col items-center justify-center p-4 overflow-y-auto transition-colors relative ${
      isDarkMode ? 'bg-[#0A0E1A]' : 'bg-gray-50'
    }`}>
      <button
        onClick={() => setIsDarkMode(!isDarkMode)}
        className={`absolute top-6 right-6 p-2.5 rounded-xl border transition-colors flex items-center justify-center ${
          isDarkMode 
            ? 'bg-[#12172A] border-[#232B45] text-[#22D3EE] hover:bg-[#1A223D]' 
            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-100 shadow-sm'
        }`}
      >
        {isDarkMode ? (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
        )}
      </button>

      <div className={`p-8 sm:p-12 rounded-2xl border w-full max-w-[420px] transition-all ${
        isDarkMode 
          ? 'bg-[#12172A] border-[#232B45] shadow-2xl shadow-black/50' 
          : 'bg-white border-gray-200 shadow-md'
      }`}>
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#34D399] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#34D399]"></span>
            </span>
            <span className={`text-xs font-bold uppercase tracking-wider ${isDarkMode ? 'text-[#22D3EE]' : 'text-green-700'}`}>
              Control Room System
            </span>
          </div>
          <h1 className={`text-2xl font-bold ${isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-900'}`}>
            모의 관제 시스템
          </h1>
        </div>
        
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <input 
              type="text" 
              className={`w-full rounded-xl px-4 py-3.5 focus:outline-none transition-all text-sm font-medium ${
                isDarkMode 
                  ? 'bg-[#0D1224] border border-[#232B45] focus:border-[#22D3EE] text-[#EDF1FC] placeholder-[#5C6584]' 
                  : 'bg-gray-50 border border-gray-200 focus:border-green-600 text-gray-800 placeholder-gray-400'
              }`}
              placeholder="ID (예: wemb@wemb.co.kr)"
              value={id}
              onChange={(e) => setId(e.target.value)}
              disabled={isLoading}
            />
          </div>
          <div className="relative flex items-center">
            <input
              type={showPassword ? 'text' : 'password'}
              className={`w-full rounded-xl pl-4 pr-12 py-3.5 focus:outline-none transition-all text-sm font-medium ${
                isDarkMode
                  ? 'bg-[#0D1224] border border-[#232B45] focus:border-[#22D3EE] text-[#EDF1FC] placeholder-[#5C6584]'
                  : 'bg-gray-50 border border-gray-200 focus:border-green-600 text-gray-800 placeholder-gray-400'
              }`}
              placeholder="비밀번호"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              disabled={isLoading}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              tabIndex={-1}
              title={showPassword ? '비밀번호 숨기기' : '비밀번호 표시'}
              className={`absolute right-1 inset-y-0 my-auto w-7 h-7 flex items-center justify-center shrink-0 rounded-lg transition-colors ${
                isDarkMode ? 'text-[#5C6584] hover:text-[#9FACC9]' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {showPassword ? (
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                  <path d="M1 1l22 22" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>

          <label className="flex items-center gap-1.5 text-xs font-medium cursor-pointer select-none group w-fit">
            <input
              type="checkbox"
              checked={rememberLogin}
              onChange={(e) => setRememberLogin(e.target.checked)}
              className="sr-only"
            />
            <span className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition-all duration-200 ${
              rememberLogin
                ? (isDarkMode ? 'bg-[#22D3EE] border-[#22D3EE] shadow-[0_0_8px_rgba(34,211,238,0.5)]' : 'bg-green-600 border-green-600')
                : (isDarkMode ? 'bg-[#0D1224] border-[#2A335A] group-hover:border-[#5C6584]' : 'bg-gray-50 border-gray-300 group-hover:border-gray-400')
            }`}>
              <svg
                className={`w-3 h-3 transition-all duration-200 ${
                  rememberLogin ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
                } ${isDarkMode ? 'text-[#0A0E1A]' : 'text-white'}`}
                fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </span>
            <span className={`transition-colors ${
              isDarkMode ? 'text-[#9FACC9] group-hover:text-[#EDF1FC]' : 'text-gray-600 group-hover:text-gray-800'
            }`}>
              자동 로그인
            </span>
          </label>

          {error && (
            <p className="text-[#FB5D75] text-xs font-semibold whitespace-pre-line pt-1">
              {error}
            </p>
          )}
          
          <button 
            type="submit" 
            disabled={isLoading}
            className={`w-full font-bold py-3.5 rounded-xl transition-all text-base mt-2 flex items-center justify-center ${
              isDarkMode 
                ? 'bg-[#22D3EE] hover:bg-[#3FDCF0] text-[#0A0E1A] shadow-[0_0_20px_rgba(34,211,238,0.2)]' 
                : 'bg-green-700 hover:bg-green-800 text-white'
            } ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
          >
            {isLoading ? '인증 중...' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginScreen;