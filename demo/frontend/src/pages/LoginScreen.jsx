import React, { useState } from 'react';

// ==========================================
// 로그인 화면 컴포넌트
// ==========================================
const LoginScreen = ({ onLogin }) => {
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');

  const handleLogin = (e) => {
    e.preventDefault();
    if (id === 'admin' && pw === '1234') {
      onLogin({ id: 'admin', name: '홍길동', dept: '관제1팀' });
    } else {
      setError('아이디 또는 비밀번호가 일치하지 않습니다.');
    }
  };

  return (
    // min-w-[340px] 추가: 화면이 340px보다 작아지면 더 이상 줄어들지 않고 스크롤 생성
    <div className="min-h-screen w-full min-w-[340px] flex flex-col items-center justify-center bg-gray-50 p-4">
      <div className="bg-white p-10 sm:p-14 rounded-2xl border border-gray-200 shadow-sm w-full max-w-[420px]">
        <div className="text-center mb-10">
          <h1 className="text-2xl font-bold text-gray-900">모의 관제 시스템</h1>
        </div>
        
        <form onSubmit={handleLogin} className="space-y-4">
          <input 
            type="text" 
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3.5 focus:outline-none focus:border-green-600 text-gray-800 text-base"
            placeholder="ID"
            value={id}
            onChange={(e) => setId(e.target.value)}
          />
          <input 
            type="password" 
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3.5 focus:outline-none focus:border-green-600 text-gray-800 text-base"
            placeholder="PW"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />
          {error && <p className="text-red-500 text-sm font-semibold">{error}</p>}
          <button 
            type="submit" 
            className="w-full bg-green-700 hover:bg-green-800 text-white font-bold py-3.5 rounded-lg transition-colors text-lg mt-4"
          >
            로그인
          </button>
        </form>

        <div className="mt-8 text-center text-xs text-gray-400">
          테스트 계정: admin / 1234
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;