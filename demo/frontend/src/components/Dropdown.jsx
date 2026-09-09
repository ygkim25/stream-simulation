import React, { useRef, useState } from 'react';
import { useClickOutside } from '../utils/useClickOutside';

// ==========================================
// 앱 전역에서 쓰는 커스텀 드롭다운 (네이티브 select 대체)
// options는 [{ value, label }] 형태로 넘김. 버튼을 누르면 목록이 펼쳐지고,
// 바깥을 클릭하거나 옵션을 고르면 닫힘
// ==========================================
const Dropdown = ({ value, onChange, options, isDarkMode, widthClass = 'w-[170px]', placeholder = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  useClickOutside(containerRef, () => setIsOpen(false), isOpen);

  const selectedLabel = options.find(opt => opt.value === value)?.label ?? placeholder;

  return (
    <div className={`relative ${widthClass}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(o => !o)}
        className={`w-full flex items-center justify-between gap-2 text-xs font-semibold px-2.5 py-1.5 rounded-lg border outline-none cursor-pointer transition-colors ${
          isDarkMode ? 'bg-[#0D1224] border-[#232B45] text-[#EDF1FC] hover:border-[#2A335A]' : 'bg-white border-gray-300 text-gray-700 hover:border-gray-400'
        }`}
      >
        <span className="truncate">{selectedLabel}</span>
        <svg
          className={`w-3.5 h-3.5 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''} ${isDarkMode ? 'text-[#7D87A8]' : 'text-gray-400'}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className={`absolute z-30 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border shadow-lg custom-scrollbar ${
          isDarkMode ? 'bg-[#12172A] border-[#232B45]' : 'bg-white border-gray-200'
        }`}>
          {options.map(opt => (
            <button
              type="button"
              key={opt.value}
              onClick={() => {
                onChange(opt.value);
                setIsOpen(false);
              }}
              className={`w-full text-left px-3 py-1.5 text-xs font-semibold truncate cursor-pointer transition-colors ${
                value === opt.value
                  ? (isDarkMode ? 'bg-[#22D3EE]/15 text-[#22D3EE]' : 'bg-green-50 text-green-700')
                  : (isDarkMode ? 'text-[#EDF1FC] hover:bg-[#232B45]' : 'text-gray-700 hover:bg-gray-100')
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default Dropdown;
