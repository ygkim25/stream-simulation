import React, { useState } from 'react';
import axios from 'axios';

// ==========================================
// 로그인 화면 컴포넌트
// ==========================================
const LoginScreen = ({ onLogin }) => {
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
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

    // API 전송 포맷 (userId, password)
    const loginData = {
      userId: id.trim(),
      password: pw.trim()
    };

    // 🔍 [디버깅 1] 전송 직전 데이터 및 타입 확인
    console.group('🔍 [Login Request Debugging]');
    console.log('1. Target URL:', '/api/auth/login');
    console.log('2. Request Payload:', JSON.stringify(loginData, null, 2));
    console.log('3. Input ID Length:', id.length, '| Processed ID:', loginData.userId);
    console.groupEnd();

    try {
      const response = await axios.post('/api/auth/login', loginData);

      // 🔍 [디버깅 2] 성공 응답 데이터 확인
      console.group('✅ [Login Success]');
      console.log('HTTP Status:', response.status);
      console.log('Response Data:', response.data);
      console.groupEnd();

      const { token, userId: resUserId, userName, divisionCode } = response.data;

      sessionStorage.setItem('token', token);
      sessionStorage.setItem('userId', resUserId);
      sessionStorage.setItem('userName', userName);
      sessionStorage.setItem('divisionCode', divisionCode);

      if (onLogin) {
        onLogin({ userId: resUserId, userName, token, divisionCode });
}

    } catch (err) {
      // 🔍 [디버깅 3] 상세 에러 분석
      console.group('❌ [Login Error Debugging]');
      if (err.response) {
        // 서버가 응답을 반환한 경우 (4xx, 5xx 에러)
        console.error('HTTP Status:', err.response.status);
        console.error('Response Headers:', err.response.headers);
        console.error('Response Data from Server:', err.response.data);

        if (err.response.status === 401) {
          setError(`[401] 아이디/비밀번호 불일치 (입력한 ID: ${loginData.userId})`);
        } else {
          setError(`[${err.response.status}] 로그인 처리 중 서버 에러가 발생했습니다.`);
        }
      } else if (err.request) {
        // 요청은 보냈으나 응답을 전혀 받지 못한 경우 (프록시/네트워크/CORS 문제)
        console.error('No response received from server. Request object:', err.request);
        setError('서버와 통신할 수 없습니다. 백엔드(8086 포트) 상태 또는 프록시 설정을 확인하세요.');
      } else {
        // 요청 세팅 중 문제 발생
        console.error('Error setting up request:', err.message);
        setError('요청 생성 실패: ' + err.message);
      }
      console.groupEnd();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full min-w-[340px] flex flex-col items-center justify-center bg-gray-50 p-4">
      <div className="bg-white p-10 sm:p-14 rounded-2xl border border-gray-200 shadow-sm w-full max-w-[420px]">
        <div className="text-center mb-10">
          <h1 className="text-2xl font-bold text-gray-900">모의 관제 시스템</h1>
        </div>
        
        <form onSubmit={handleLogin} className="space-y-4">
          <input 
            type="text" 
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3.5 focus:outline-none focus:border-green-600 text-gray-800 text-base"
            placeholder="ID (예: wemb@wemb.co.kr)"
            value={id}
            onChange={(e) => setId(e.target.value)}
            disabled={isLoading}
          />
          <input 
            type="password" 
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3.5 focus:outline-none focus:border-green-600 text-gray-800 text-base"
            placeholder="PW"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            disabled={isLoading}
          />
          
          {error && <p className="text-red-500 text-sm font-semibold whitespace-pre-line">{error}</p>}
          
          <button 
            type="submit" 
            disabled={isLoading}
            className={`w-full bg-green-700 hover:bg-green-800 text-white font-bold py-3.5 rounded-lg transition-colors text-lg mt-4 flex items-center justify-center ${
              isLoading ? 'opacity-70 cursor-not-allowed' : ''
            }`}
          >
            {isLoading ? '로그인 중...' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginScreen;