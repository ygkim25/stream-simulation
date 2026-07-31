import React, { useState } from 'react';
import { getDivisionName } from '../constants/division';

// ==========================================
// 마이페이지 팝업 컴포넌트 (다크 / 라이트 모드 지원)
// ==========================================
const MyPageModal = ({ user, onClose, onLogout, isDarkMode }) => {
  const [name, setName] = useState(user?.userName || '');
  const [dept, setDept] = useState(getDivisionName(user?.divisionCode));
  const [id, setId] = useState(user?.userId || 'admin');

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleLogoutClick = () => {
    if (window.confirm('로그아웃 하시겠습니까?')) {
      onLogout?.();
    }
  };

  const inputClass = `w-full rounded-lg px-4 py-3.5 focus:outline-none text-[14px] transition-all box-border border ${
    isDarkMode 
      ? 'bg-[#0D1224] border-[#232B45] focus:border-[#22D3EE] text-[#EDF1FC] placeholder-[#5C6584]' 
      : 'bg-gray-50 border-gray-200 focus:border-green-600 text-gray-800 placeholder-gray-400'
  }`;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        minWidth: '340px',
        backgroundColor: isDarkMode ? 'rgba(5, 8, 16, 0.75)' : 'rgba(0, 0, 0, 0.4)',
        backdropFilter: 'blur(3px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
      onClick={handleOverlayClick}
    >
      <div
        className={`rounded-xl shadow-2xl overflow-hidden flex flex-col border transition-colors ${
          isDarkMode 
            ? 'bg-[#12172A] border-[#232B45]' 
            : 'bg-white border-gray-200'
        }`}
        style={{
          width: '100%',
          maxWidth: '480px',
          minWidth: '340px',
          margin: '0 20px',
          position: 'relative',
          zIndex: 100000
        }}
      >

        {/* 상단 헤더 */}
        <div className={`px-6 py-5 flex items-center justify-between border-b ${
          isDarkMode 
            ? 'bg-[#0D1224] border-[#232B45] text-[#EDF1FC]' 
            : 'bg-gray-50 border-gray-200 text-gray-800'
        }`}>
          <h2 className="text-[16px] font-bold tracking-tight m-0">마이페이지</h2>
          <button
            onClick={onClose}
            className={`text-2xl leading-none transition-colors outline-none bg-transparent border-none cursor-pointer ${
              isDarkMode ? 'text-[#5C6584] hover:text-[#EDF1FC]' : 'text-gray-400 hover:text-gray-800'
            }`}
          >
            &times;
          </button>
        </div>

        {/* 팝업 본문 */}
        <div className="p-7 flex flex-col gap-5">

          <div className="space-y-3">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              placeholder="이름"
            />
            <input
              type="text"
              value={dept}
              onChange={(e) => setDept(e.target.value)}
              className={inputClass}
              placeholder="부서"
            />
            <input
              type="text"
              value={id}
              readOnly
              className={`w-full border rounded-lg px-4 py-3.5 font-mono text-[14px] cursor-not-allowed box-border ${
                isDarkMode 
                  ? 'bg-[#0A0E1A] border-[#1E253D] text-[#5C6584]' 
                  : 'bg-gray-100 border-gray-200 text-gray-400'
              }`}
              placeholder="계정"
            />
          </div>

          <div className="pt-1">
            <h3 className={`text-[12px] font-bold uppercase tracking-wider m-0 ${
              isDarkMode ? 'text-[#22D3EE]' : 'text-green-700'
            }`}>
              비밀번호 변경
            </h3>
          </div>

          <div className="space-y-3">
            <input type="password" className={inputClass} placeholder="현재 비밀번호" />
            <input type="password" className={inputClass} placeholder="새 비밀번호" />
            <input type="password" className={inputClass} placeholder="비밀번호 확인" />
          </div>

          <div className="mt-2">
            <button
              onClick={() => {
                alert('변경사항이 저장되었습니다.');
                onClose();
              }}
              className={`w-full font-bold py-3.5 rounded-lg transition-colors text-[15px] cursor-pointer border-none ${
                isDarkMode 
                  ? 'bg-[#22D3EE] hover:bg-[#3FDCF0] text-[#0A0E1A]' 
                  : 'bg-green-700 hover:bg-green-800 text-white'
              }`}
            >
              저장
            </button>
          </div>

          <div>
            <button
              onClick={handleLogoutClick}
              className={`w-full font-bold py-3 rounded-lg transition-colors text-[14px] cursor-pointer border ${
                isDarkMode 
                  ? 'bg-transparent hover:bg-[#FB5D75]/10 text-[#FB5D75] border-[#FB5D75]/30' 
                  : 'bg-transparent hover:bg-red-50 text-red-600 border-red-200'
              }`}
            >
              로그아웃
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};

export default MyPageModal;