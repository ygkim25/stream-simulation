import React, { useState } from 'react';
import axios from 'axios';
import CustomAlert from './CustomAlert';
import { API_BASE_URL } from '../utils/apiConfig';

// 헤더에서 바로 이동 가능한 모드 목록 (메인 화면까지 안 거치고 바로 전환)
const NAV_ITEMS = [
  { value: 'realtime', label: '실시간 모니터링' },
  { value: 'simulation', label: '시뮬레이션' },
];

const Header = ({ user, route, setRoute, openMyPage, isDarkMode, setIsDarkMode, isAlarmOn, setIsAlarmOn }) => {
  const isAdmin = user?.role === 'ADMIN' || user?.userId === 'admin';
  // 알람 on/off를 눌렀을 때, 그 상태가 바뀌었다는 걸 커스텀 알림창으로 한 번 확인시켜줌
  // (브라우저 알림은 밀린 알람이 몰려서 뜰 때와 헷갈리기 쉬워 인앱 알림으로 대체함)
  const [toggleMessage, setToggleMessage] = useState('');
  const handleToggleAlarm = async () => {
    const next = !isAlarmOn;
    setIsAlarmOn(next); // 응답 기다리지 않고 먼저 화면부터 반영 (실패하면 되돌림)
    try {
      const res = await axios.patch(
        `${API_BASE_URL}/api/employee/me/alarm`,
        { alarmEnable: next ? 'on' : 'off' },
        { headers: user?.token ? { Authorization: `Bearer ${user.token}` } : {} }
      );
      const saved = res.data?.alarmEnable !== 'off';
      setIsAlarmOn(saved);
      setToggleMessage(saved ? '알람이 켜졌습니다.' : '알람이 꺼졌습니다.');
    } catch (err) {
      console.error('알람 설정 저장 실패:', err);
      setIsAlarmOn(!next); // 저장 실패 시 원래 상태로 되돌림
      setToggleMessage('알람 설정을 저장하지 못했습니다. 다시 시도해 주세요.');
    }
  };
  return (
    <header className={`h-[64px] border-b flex items-center justify-between px-6 shrink-0 transition-colors ${
      isDarkMode 
        ? 'bg-[#0D1224] border-[#232B45] text-[#EDF1FC]' 
        : 'bg-white border-gray-200 text-gray-800 shadow-sm'
    }`}>
      <div className="flex items-center gap-4">
        <h1
          className="flex items-center gap-2.5 cursor-pointer group"
          onClick={() => setRoute('main')}
        >
          {/* 로고 마크 */}
          <span className={`flex items-center justify-center w-9 h-9 rounded-xl shrink-0 font-black text-base tracking-tight text-white shadow-md transition-transform group-hover:scale-105 bg-linear-to-br ${
            isDarkMode ? 'from-[#22D3EE] to-[#6366F1] shadow-[#22D3EE]/30' : 'from-green-500 to-teal-600 shadow-green-500/30'
          }`}>
            W
          </span>
          <span className={`text-[17px] font-extrabold tracking-tight transition-colors ${
            isDarkMode ? 'text-[#EDF1FC] group-hover:text-[#22D3EE]' : 'text-gray-900 group-hover:text-green-700'
          }`}>
            WeCT
          </span>
        </h1>
        {/* 헤더에서 바로 모드 전환 (메인 화면 안 거치고 실시간/시뮬레이션 바로 이동).
            헤더 전체 높이만큼 늘려서, 활성 탭의 밑줄이 헤더 하단 테두리에 딱 붙게 함 */}
        <nav className="hidden md:flex items-stretch gap-6 self-stretch ml-4">
          {NAV_ITEMS.map(item => (
            <button
              key={item.value}
              type="button"
              onClick={() => setRoute(item.value)}
              className={`flex items-center text-[13px] font-bold tracking-wide border-b-2 transition-all outline-none cursor-pointer hover:scale-110 ${
                route === item.value
                  ? (isDarkMode ? 'text-[#22D3EE] border-[#22D3EE]' : 'text-green-700 border-green-700')
                  : (isDarkMode ? 'text-[#7D87A8] hover:text-[#B9C2DE] border-transparent' : 'text-gray-500 hover:text-gray-800 border-transparent')
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-3">
        {/* 다크 / 라이트 모드 토글 버튼 */}
        <button
          onClick={() => setIsDarkMode(!isDarkMode)}
          className={`p-2 rounded-lg border transition-colors flex items-center justify-center ${
            isDarkMode 
              ? 'bg-[#151B30] border-[#232B45] text-[#22D3EE] hover:bg-[#1A223D]' 
              : 'bg-gray-100 border-gray-300 text-gray-600 hover:bg-gray-200'
          }`}
          title={isDarkMode ? '라이트 모드로 변경' : '다크 모드로 변경'}
        >
          {isDarkMode ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          )}
        </button>

        {/* 알람 on/off 토글 버튼 (관리자 전용) */}
        {isAdmin && (
          <button
            onClick={handleToggleAlarm}
            className={`p-2 rounded-lg border transition-colors flex items-center justify-center ${
              isDarkMode
                ? 'bg-[#151B30] border-[#232B45] text-[#22D3EE] hover:bg-[#1A223D]'
                : 'bg-gray-100 border-gray-300 text-gray-600 hover:bg-gray-200'
            }`}
            title={isAlarmOn ? '알람 끄기' : '알람 켜기'}
          >
            {/* off 아이콘도 같은 종 모양에 사선만 그어서, on/off가 서로 다른 아이콘처럼 안 보이게 함 */}
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              {!isAlarmOn && (
                <line x1="4" y1="4" x2="20" y2="20" strokeLinecap="round" strokeWidth="2" />
              )}
            </svg>
          </button>
        )}

        {/* 내 정보 메뉴 */}
        <div
          className={`flex items-center gap-2.5 cursor-pointer pl-2.5 pr-2 py-1.5 rounded-lg transition-colors border ${
            isDarkMode
              ? 'hover:bg-[#151B30] border-transparent hover:border-[#232B45]'
              : 'hover:bg-gray-100 border-transparent hover:border-gray-200'
          }`}
          onClick={() => openMyPage()}
        >
          <div className="flex flex-col leading-tight">
            {/* 이름 + 직급 (오른쪽 작게) */}
            <div className="flex items-baseline gap-1">
              <span className={`text-[13px] font-bold ${isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-800'}`}>
                {user?.userName || '사용자'}
              </span>
              {user?.responsibility && (
                <span className={`text-[11px] font-medium ${isDarkMode ? 'text-[#7D87A8]' : 'text-gray-400'}`}>
                  · {user.responsibility}
                </span>
              )}
            </div>
            {/* 부서명 */}
            <span className={`text-[11px] ${isDarkMode ? 'text-[#7D87A8]' : 'text-gray-500'}`}>
              {user?.divisionName || '관제팀'}
            </span>
          </div>
          <svg className={`w-3.5 h-3.5 shrink-0 ${isDarkMode ? 'text-[#5C6584]' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>

      <CustomAlert message={toggleMessage} onClose={() => setToggleMessage('')} isDarkMode={isDarkMode} />
    </header>
  );
};

export default Header;