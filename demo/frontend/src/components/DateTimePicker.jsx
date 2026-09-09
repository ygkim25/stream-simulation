import React, { useState, useRef, useEffect } from 'react';
import Dropdown from './Dropdown';

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => ({ value: h, label: `${String(h).padStart(2, '0')}시` }));
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, m) => ({ value: m, label: `${String(m).padStart(2, '0')}분` }));

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const isSameDay = (a, b) => (
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
);
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// 트리거 버튼에 보여줄 "yyyy.M.d HH:mm" 형식(24시간제)
const formatTrigger = (date) => {
  const yyyy = date.getFullYear();
  const mm = date.getMonth() + 1;
  const dd = date.getDate();
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${yyyy}.${mm}.${dd} ${hh}:${min}`;
};

// ==========================================
// 브라우저 기본 datetime-local 입력(운영체제마다 생김새가 다른 네이티브 달력) 대신,
// 앱 테마와 통일된 커스텀 달력 + 시:분 선택 팝오버
// ==========================================
const DateTimePicker = ({ value, onChange, min, max, isDarkMode, label }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => new Date(value.getFullYear(), value.getMonth(), 1));
  const wrapperRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    setViewMonth(new Date(value.getFullYear(), value.getMonth(), 1));
    const handleClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const minDay = min ? startOfDay(min) : null;
  const maxDay = max ? startOfDay(max) : null;

  const isDayDisabled = (day) => {
    if (day == null) return true;
    const d = new Date(year, month, day);
    if (minDay && d < minDay) return true;
    if (maxDay && d > maxDay) return true;
    return false;
  };

  const handleDayClick = (day) => {
    if (isDayDisabled(day)) return;
    onChange(new Date(year, month, day, value.getHours(), value.getMinutes(), 0, 0));
  };

  const handleTimeChange = (field, num) => {
    const next = new Date(value);
    if (field === 'hour') next.setHours(num);
    else next.setMinutes(num);
    onChange(next);
  };

  const navButtonClass = isDarkMode
    ? 'text-[#7D87A8] hover:text-[#EDF1FC] hover:bg-[#1E2745]'
    : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100';

  return (
    <div ref={wrapperRef} className="relative">
      <label className={`block text-[11px] font-bold mb-1 ${isDarkMode ? 'text-[#7D87A8]' : 'text-gray-400'}`}>{label}</label>
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className={`w-full flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-mono outline-none border cursor-pointer transition-colors ${
          isDarkMode ? 'bg-[#0D1224] border-[#232B45] text-[#EDF1FC] hover:border-[#22D3EE]/60' : 'bg-gray-50 border-gray-200 text-gray-800 hover:border-green-400'
        }`}
      >
        <svg className={`w-3.5 h-3.5 shrink-0 ${isDarkMode ? 'text-[#5C6584]' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        {formatTrigger(value)}
      </button>

      {isOpen && (
        <div className={`absolute z-50 top-full left-0 mt-1.5 w-[230px] p-2.5 rounded-xl border shadow-2xl ${
          isDarkMode ? 'bg-[#151B30] border-[#232B45]' : 'bg-white border-gray-200'
        }`}>
          {/* 월 이동 헤더 */}
          <div className="flex items-center justify-between mb-1.5 px-0.5">
            <button type="button" onClick={() => setViewMonth(new Date(year, month - 1, 1))} className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${navButtonClass}`}>
              ‹
            </button>
            <span className={`text-xs font-bold ${isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-800'}`}>{year}년 {month + 1}월</span>
            <button type="button" onClick={() => setViewMonth(new Date(year, month + 1, 1))} className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${navButtonClass}`}>
              ›
            </button>
          </div>

          {/* 요일 */}
          <div className="grid grid-cols-7 mb-0.5">
            {WEEKDAYS.map(w => (
              <span key={w} className={`text-[10px] font-bold text-center ${isDarkMode ? 'text-[#5C6584]' : 'text-gray-400'}`}>{w}</span>
            ))}
          </div>

          {/* 날짜 그리드 */}
          <div className="grid grid-cols-7 gap-y-0.5">
            {cells.map((day, i) => {
              if (day == null) return <span key={i} className="h-7" />;
              const cellDate = new Date(year, month, day);
              const disabled = isDayDisabled(day);
              const selected = isSameDay(cellDate, value);
              const isToday = isSameDay(cellDate, new Date());
              return (
                <button
                  key={i}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleDayClick(day)}
                  className={`h-7 rounded-full text-[11px] font-mono flex items-center justify-center transition-colors ${
                    disabled
                      ? (isDarkMode ? 'text-[#3A4160] cursor-not-allowed' : 'text-gray-300 cursor-not-allowed')
                      : selected
                        ? (isDarkMode ? 'bg-[#22D3EE] text-[#0A0E1A] font-bold' : 'bg-green-600 text-white font-bold')
                        : isToday
                          ? (isDarkMode ? 'text-[#22D3EE] border border-[#22D3EE]/40' : 'text-green-700 border border-green-300')
                          : (isDarkMode ? 'text-[#B9C2DE] hover:bg-[#1E2745]' : 'text-gray-700 hover:bg-gray-100')
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* 시:분 선택 (네이티브 select 대신 앱 전역에서 쓰는 커스텀 드롭다운) */}
          <div className={`flex items-center justify-center gap-1.5 mt-2 pt-2 border-t ${isDarkMode ? 'border-[#232B45]' : 'border-gray-200'}`}>
            <Dropdown
              value={value.getHours()}
              onChange={(v) => handleTimeChange('hour', v)}
              options={HOUR_OPTIONS}
              isDarkMode={isDarkMode}
              widthClass="w-[88px]"
            />
            <Dropdown
              value={value.getMinutes()}
              onChange={(v) => handleTimeChange('minute', v)}
              options={MINUTE_OPTIONS}
              isDarkMode={isDarkMode}
              widthClass="w-[88px]"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default DateTimePicker;
