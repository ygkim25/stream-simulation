import React from 'react';

// ==========================================
// 크롬 기본 alert() 대체용 커스텀 알림 팝업 (다크 / 라이트 모드 지원)
// ==========================================
const CustomAlert = ({ message, onClose, isDarkMode }) => {
  if (!message) return null;

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
        className={`w-full max-w-[360px] rounded-2xl shadow-2xl border p-6 transition-all ${
          isDarkMode ? 'bg-[#12172A] border-[#232B45] text-[#EDF1FC]' : 'bg-white border-gray-200 text-gray-800'
        }`}
      >
        <p className="text-[14px] leading-relaxed whitespace-pre-line mb-5">{message}</p>
        <button
          onClick={onClose}
          className={`w-full font-bold py-2.5 rounded-xl transition-colors text-[14px] cursor-pointer border-none ${
            isDarkMode ? 'bg-[#22D3EE] hover:bg-[#3FDCF0] text-[#0A0E1A]' : 'bg-green-700 hover:bg-green-800 text-white'
          }`}
        >
          확인
        </button>
      </div>
    </div>
  );
};

export default CustomAlert;
