import React from 'react';

// 원형으로 도는 로딩 스피너 (데이터 로딩 중임을 명확하게 보여주기 위함)
const SIZE_PX = { xs: 12, sm: 16, md: 28, lg: 40 };

const LoadingSpinner = ({ size = 'md', isDarkMode, label, className = '' }) => {
  const px = SIZE_PX[size] || SIZE_PX.md;
  const trackColor = isDarkMode ? '#232B45' : '#E5E7EB';
  const accentColor = isDarkMode ? '#22D3EE' : '#22C55E';
  return (
    <div className={`flex flex-col items-center justify-center gap-2 ${className}`}>
      <div
        className="animate-spin rounded-full"
        style={{
          width: px,
          height: px,
          border: `${Math.max(2, Math.round(px / 10))}px solid ${trackColor}`,
          borderTopColor: accentColor,
        }}
      />
      {label && (
        <p className={`text-xs font-semibold ${isDarkMode ? 'text-[#7D87A8]' : 'text-gray-400'}`}>{label}</p>
      )}
    </div>
  );
};

export default LoadingSpinner;
