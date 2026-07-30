import React, { useState } from 'react';
import { getDivisionName } from '../constants/division';



// ==========================================
// 마이페이지 팝업 컴포넌트
// ==========================================
const MyPageModal = ({ user, onClose, onLogout }) => {
  const [name, setName] = useState(user?.userName || '');
  const [dept, setDept] = useState(getDivisionName(user?.divisionCode));
  const [id, setId] = useState(user?.userId || 'admin'); // 계정 정보 (수정 불가)

  // 배경 클릭 시 모달 닫기
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // 🚀 [추가됨] 로그아웃 확인 후 처리
  const handleLogoutClick = () => {
    if (window.confirm('로그아웃 하시겠습니까?')) {
      onLogout?.();
    }
  };

  return (
    // 최상단 오버레이: 무조건 화면 전체를 덮고, 중앙 정렬하도록 인라인 스타일 강제 부여
    // 여기에 minWidth: '340px'를 추가하여 배경 자체가 쪼그라드는 것을 방지합니다.
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        minWidth: '340px', // 전체 배경 오버레이 최소 너비 보호
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
      onClick={handleOverlayClick}
    >
      {/* 팝업 창 컨테이너: 최대 너비 500px, 최소 너비 340px 지정 */}
      <div 
        className="bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col"
        style={{
          width: '100%',
          maxWidth: '500px',
          minWidth: '340px', 
          margin: '0 20px', 
          position: 'relative',
          zIndex: 100000
        }}
      >
        
        {/* 상단 그린 헤더 */}
        <div className="bg-green-800 text-white px-6 py-6 flex items-center justify-between">
          <h2 className="text-xl font-bold tracking-wide m-0">마이페이지</h2>
          <button 
            onClick={onClose} 
            className="text-green-200 hover:text-white text-3xl leading-none transition-colors outline-none bg-transparent border-none cursor-pointer"
          >
            &times;
          </button>
        </div>

        {/* 팝업 본문 (입력 폼) */}
        <div className="p-8 flex flex-col gap-5">
          
          {/* 기본 정보 그룹 */}
          <div className="space-y-4">
            <input 
              type="text" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-gray-50/50 border border-gray-200 rounded-lg px-4 py-3.5 focus:outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600 text-gray-800 placeholder-gray-400 text-base transition-all box-border"
              placeholder="이름"
            />
            <input 
              type="text" 
              value={dept}
              onChange={(e) => setDept(e.target.value)}
              className="w-full bg-gray-50/50 border border-gray-200 rounded-lg px-4 py-3.5 focus:outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600 text-gray-800 placeholder-gray-400 text-base transition-all box-border"
              placeholder="부서"
            />
            <input 
              type="text" 
              value={id}
              readOnly
              className="w-full bg-gray-100 border border-gray-200 rounded-lg px-4 py-3.5 text-gray-500 placeholder-gray-400 text-base cursor-not-allowed box-border"
              placeholder="계정"
            />
          </div>

          {/* 비밀번호 변경 섹션 타이틀 */}
          <div className="mt-4 mb-2">
            <h3 className="text-sm font-bold text-green-800 m-0">비밀번호 변경</h3>
          </div>

          {/* 비밀번호 변경 그룹 */}
          <div className="space-y-4">
            <input 
              type="password" 
              className="w-full bg-gray-50/50 border border-gray-200 rounded-lg px-4 py-3.5 focus:outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600 text-gray-800 placeholder-gray-400 text-base transition-all box-border"
              placeholder="현재 비밀번호"
            />
            <input 
              type="password" 
              className="w-full bg-gray-50/50 border border-gray-200 rounded-lg px-4 py-3.5 focus:outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600 text-gray-800 placeholder-gray-400 text-base transition-all box-border"
              placeholder="새 비밀번호"
            />
            <input 
              type="password" 
              className="w-full bg-gray-50/50 border border-gray-200 rounded-lg px-4 py-3.5 focus:outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600 text-gray-800 placeholder-gray-400 text-base transition-all box-border"
              placeholder="비밀번호 확인"
            />
          </div>

          {/* 저장 버튼 */}
          <div className="mt-6">
            <button 
              onClick={() => {
                alert('변경사항이 저장되었습니다.');
                onClose();
              }}
              className="w-full bg-green-700 hover:bg-green-800 text-white font-bold py-3.5 rounded-lg transition-colors text-lg cursor-pointer border-none"
            >
              저장
            </button>
          </div>

          {/* 🚀 [추가됨] 로그아웃 버튼 */}
          <div>
            <button 
              onClick={handleLogoutClick}
              className="w-full bg-white hover:bg-red-50 text-red-600 font-bold py-3 rounded-lg transition-colors text-base cursor-pointer border border-red-200"
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
