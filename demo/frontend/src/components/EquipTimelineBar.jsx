import React from 'react';
import LoadingSpinner from './LoadingSpinner';

// 상태(정상/경고/위험) 타임라인 바 색상
const TIMELINE_COLOR = {
  green: { dark: '#34D399', light: '#22C55E' },
  amber: { dark: '#FBBF24', light: '#F59E0B' },
  red: { dark: '#FB5D75', light: '#EF4444' },
};

// ==========================================
// 설비 하나의 전체 구간(시작~끝) 상태 흐름을 색 띠로 보여주는 미니 타임라인
// playheadPct가 주어지면 세로선으로 "지금 이 지점"이 전체에서 어디쯤인지 표시함
// (시뮬레이션 모드: 재생 위치 / 실시간 모니터링 모드: 선택한 기간의 최신 시점)
// ==========================================
const EquipTimelineBar = ({ segments, playheadPct, isDarkMode, loading }) => {
  const trackColor = isDarkMode ? '#0D1224' : '#F3F4F6';
  // 아직 첫 조회가 끝나기 전(로딩 중)에는 "데이터가 확실히 없음"과 구분되도록 스피너를 보여줌
  if (loading) {
    return (
      <div className="w-full h-3.5 rounded flex items-center justify-center" style={{ backgroundColor: trackColor }}>
        <LoadingSpinner size="sm" isDarkMode={isDarkMode} />
      </div>
    );
  }
  if (!segments || segments.length === 0) {
    return <div className="w-full h-3.5 rounded" style={{ backgroundColor: trackColor }} />;
  }
  return (
    <div className="relative w-full h-3.5 rounded overflow-hidden flex" style={{ backgroundColor: trackColor }}>
      {segments.map((seg, i) => (
        <div
          key={i}
          style={{ width: `${seg.widthPct}%`, backgroundColor: TIMELINE_COLOR[seg.color][isDarkMode ? 'dark' : 'light'] }}
        />
      ))}
      {playheadPct != null && (
        <div
          className={`absolute top-0 bottom-0 w-[2px] ${isDarkMode ? 'bg-white/60' : 'bg-gray-900/70'}`}
          // 100%에 딱 걸치면 overflow-hidden에 잘려서 안 보이므로, 살짝 안쪽으로 여유를 둠
          style={{ left: `${Math.min(Math.max(playheadPct, 0), 99)}%` }}
        />
      )}
    </div>
  );
};

export default EquipTimelineBar;
