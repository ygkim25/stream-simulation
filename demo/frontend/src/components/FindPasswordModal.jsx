import React, { useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../utils/apiConfig';

// 로그인 화면 "비밀번호 찾기" 팝업 - 이메일(아이디) 입력 후 인증번호 전송 요청까지만 처리
const FindPasswordModal = ({ onClose, isDarkMode }) => {
  const [email, setEmail] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [message, setMessage] = useState('');
  const [isSent, setIsSent] = useState(false);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!email.trim()) {
      setMessage('이메일(아이디)을 입력해 주세요.');
      return;
    }
    setIsSending(true);
    setMessage('');
    try {
      await axios.post(`${API_BASE_URL}/api/auth/reset-password`, { userId: email.trim() });
      setIsSent(true);
      setMessage('인증번호를 발송했습니다. 이메일을 확인해 주세요.');
    } catch (err) {
      const serverMessage = typeof err.response?.data === 'string'
        ? err.response.data
        : err.response?.data?.message;
      setMessage(serverMessage || '인증번호 발송에 실패했습니다. 다시 시도해 주세요.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[999999] flex items-center justify-center p-4"
      style={{
        backgroundColor: isDarkMode ? 'rgba(5, 8, 16, 0.75)' : 'rgba(0, 0, 0, 0.4)',
        backdropFilter: 'blur(3px)',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-[380px] rounded-2xl shadow-2xl border p-6 transition-all ${
          isDarkMode ? 'bg-[#12172A] border-[#232B45] text-[#EDF1FC]' : 'bg-white border-gray-200 text-gray-800'
        }`}
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-bold">비밀번호 찾기</h3>
          <button
            onClick={onClose}
            className={`p-1 rounded-lg transition-colors cursor-pointer border-none bg-transparent ${
              isDarkMode ? 'text-[#7D87A8] hover:text-[#EDF1FC]' : 'text-gray-400 hover:text-gray-700'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p className={`text-xs mb-5 ${isDarkMode ? 'text-[#9FACC9]' : 'text-gray-500'}`}>
          가입 시 사용한 이메일(아이디)을 입력하면 인증번호를 보내드립니다.
        </p>

        <form onSubmit={handleSend} className="space-y-3">
          <input
            type="email"
            className={`w-full rounded-xl px-4 py-3 focus:outline-none transition-all text-sm font-medium ${
              isDarkMode
                ? 'bg-[#0D1224] border border-[#232B45] focus:border-[#22D3EE] text-[#EDF1FC] placeholder-[#5C6584]'
                : 'bg-gray-50 border border-gray-200 focus:border-green-600 text-gray-800 placeholder-gray-400'
            }`}
            placeholder="이메일 (아이디)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isSending}
            autoFocus
          />

          {message && (
            <p className={`text-xs font-semibold ${isSent ? (isDarkMode ? 'text-[#34D399]' : 'text-green-600') : 'text-[#FB5D75]'}`}>
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={isSending}
            className={`w-full font-bold py-3 rounded-xl transition-all text-sm mt-1 flex items-center justify-center ${
              isDarkMode
                ? 'bg-[#22D3EE] hover:bg-[#3FDCF0] text-[#0A0E1A] shadow-[0_0_20px_rgba(34,211,238,0.2)]'
                : 'bg-green-700 hover:bg-green-800 text-white'
            } ${isSending ? 'opacity-70 cursor-not-allowed' : ''}`}
          >
            {isSending ? '전송 중...' : '인증번호 전송'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default FindPasswordModal;
