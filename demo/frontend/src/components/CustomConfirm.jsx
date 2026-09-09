import React from 'react';

// ==========================================
// 크롬 기본 confirm() 대체용 커스텀 확인 팝업 (다크 / 라이트 모드 지원)
// ==========================================
const CustomConfirm = ({ message, onConfirm, onCancel, isDarkMode, confirmLabel = '확인', cancelLabel = '취소' }) => {
  if (!message) return null;

  return (
    <div
      className="fixed inset-0 z-[999999] flex items-center justify-center p-4"
      style={{
        backgroundColor: isDarkMode ? 'rgba(5, 8, 16, 0.75)' : 'rgba(0, 0, 0, 0.4)',
        backdropFilter: 'blur(3px)',
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-[360px] rounded-2xl shadow-2xl border p-6 transition-all ${
          isDarkMode ? 'bg-[#12172A] border-[#232B45] text-[#EDF1FC]' : 'bg-white border-gray-200 text-gray-800'
        }`}
      >
        <p className="text-[14px] leading-relaxed whitespace-pre-line mb-5">{message}</p>
        <div className="flex gap-2.5">
          <button
            onClick={onCancel}
            className={`flex-1 font-bold py-2.5 rounded-xl transition-colors text-[14px] cursor-pointer border ${
              isDarkMode
                ? 'bg-transparent hover:bg-[#1A223D] text-[#9FACC9] border-[#232B45]'
                : 'bg-transparent hover:bg-gray-100 text-gray-600 border-gray-200'
            }`}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 font-bold py-2.5 rounded-xl transition-colors text-[14px] cursor-pointer border-none ${
              isDarkMode ? 'bg-[#FB5D75] hover:bg-[#ff7d92] text-[#0A0E1A]' : 'bg-red-600 hover:bg-red-700 text-white'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CustomConfirm;
