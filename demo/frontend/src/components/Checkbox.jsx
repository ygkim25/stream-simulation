import React from 'react';

// 커스텀 스타일 체크박스 (네이티브 input은 시각적으로 숨기고 클릭 영역/키보드 접근성만 유지)
const Checkbox = ({ checked, onChange, isDarkMode, label }) => (
  <label className={`flex items-center gap-1.5 text-xs font-semibold cursor-pointer select-none ${isDarkMode ? 'text-[#B9C2DE]' : 'text-gray-700'}`}>
    <input type="checkbox" checked={checked} onChange={onChange} className="sr-only peer" />
    <span className={`w-4 h-4 rounded flex items-center justify-center border transition-colors shrink-0 peer-focus-visible:ring-2 ${
      isDarkMode ? 'peer-focus-visible:ring-[#22D3EE]/50' : 'peer-focus-visible:ring-green-400'
    } ${
      checked
        ? (isDarkMode ? 'bg-[#22D3EE] border-[#22D3EE]' : 'bg-green-600 border-green-600')
        : (isDarkMode ? 'border-[#2A335A] bg-[#0D1224]' : 'border-gray-300 bg-white')
    }`}>
      {checked && (
        <svg className={`w-3 h-3 ${isDarkMode ? 'text-[#0A0E1A]' : 'text-white'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      )}
    </span>
    {label}
  </label>
);

export default Checkbox;
