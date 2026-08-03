import React, { useState, useEffect } from 'react';
import LoginScreen from './pages/LoginScreen';
import MainScreen from './pages/MainScreen';
import RealtimeScreen from './pages/RealtimeScreen';
import MyPageModal from './components/MyPageModal'; 
import FullLogModal from './components/FullLogModal';

export default function App() {
  // 1. 새로고침 시 sessionStorage에서 유저 객체 복원
  const [user, setUser] = useState(() => {
    try {
      const savedUser = sessionStorage.getItem('user');
      return savedUser ? JSON.parse(savedUser) : null;
    } catch (e) {
      console.error('세션 복원 실패:', e);
      return null;
    }
  });

  // 2. 세션 유무에 따라 초기 화면 라우트 설정
  const [route, setRoute] = useState(() => {
    const savedUser = sessionStorage.getItem('user');
    return savedUser ? 'main' : 'login';
  });

  const [isMyPageOpen, setIsMyPageOpen] = useState(false);
  const [myPageInitialTab, setMyPageInitialTab] = useState('info');
  const [isLogOpen, setIsLogOpen] = useState(false); 

  const [isDarkMode, setIsDarkMode] = useState(true);

  // 다크모드 클래스 토글
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // 알람 데이터
  const [alarms, setAlarms] = useState([
    { id: 1, equipName: '압축기 D', time: '15:14:02', value: 105.8, threshold: 100, location: '3구역 / 설비3팀' },
    { id: 2, equipName: '냉각 팬 B', time: '15:10:45', value: 65.0, threshold: 60, location: '1구역 / 설비1팀' },
  ]);

  // 로그 데이터
  const [logs, setLogs] = useState([
    { id: 100, time: '09:00:00', type: 'info', equipName: '시스템', message: '오전 관제 모니터링 시스템 기동 완료.' },
    { id: 101, time: '09:05:12', type: 'info', equipName: '시스템', message: 'DB 동기화 완료 및 실시간 데이터 수신 시작.' },
    { id: 102, time: '09:15:30', type: 'info', equipName: '메인 펌프 A', message: '초기 가동 점검 정상 확인.' },
    { id: 103, time: '10:22:15', type: 'warning', equipName: '냉각 팬 B', message: '회전수 미세 감소 감지. 모니터링 강화 설정.', value: 58.2, threshold: 60 },
    { id: 104, time: '10:45:00', type: 'success', equipName: '냉각 팬 B', message: '회전수 정상 범위로 자체 복구됨.' },
    { id: 120, time: '15:14:02', type: 'warning', equipName: '압축기 D', message: '임계값을 완전히 초과하여 가동이 일시 중지되었습니다.', value: 105.8, threshold: 100 },
  ]);

  // 로그인 처리
  const handleLogin = (userInfo) => {
    setUser(userInfo);
    if (userInfo) {
      sessionStorage.setItem('user', JSON.stringify(userInfo));
    }
    setRoute('main');
  };

  // 로그아웃 처리
  const handleLogout = () => {
    sessionStorage.removeItem('user');
    setUser(null);
    setIsMyPageOpen(false);
    setRoute('login');
  };

  const handleMyPageOpen = (tab) => {
    setMyPageInitialTab(tab || 'info');
    setIsMyPageOpen(true);
  };
  const handleMyPageClose = () => setIsMyPageOpen(false);
  const handleLogOpen = () => setIsLogOpen(true);
  const handleLogClose = () => setIsLogOpen(false);
  const handleClearLogs = () => setLogs([]);

  return (
    <>
      {route === 'login' && (
        <LoginScreen 
          onLogin={handleLogin} 
          isDarkMode={isDarkMode} 
          setIsDarkMode={setIsDarkMode} 
        />
      )}

      {route === 'main' && (
        <MainScreen 
          user={user} 
          setRoute={setRoute} 
          openMyPage={handleMyPageOpen} 
          isDarkMode={isDarkMode} 
          setIsDarkMode={setIsDarkMode} 
        />
      )}

      {route === 'realtime' && (
        <RealtimeScreen 
          user={user} 
          setRoute={setRoute} 
          openMyPage={handleMyPageOpen} 
          alarms={alarms} 
          setAlarms={setAlarms} 
          openLogs={handleLogOpen}
          isDarkMode={isDarkMode}
          setIsDarkMode={setIsDarkMode}
        />
      )}

      {isMyPageOpen && (
        <MyPageModal
          user={user}
          onClose={handleMyPageClose}
          onLogout={handleLogout}
          isDarkMode={isDarkMode}
          initialTab={myPageInitialTab}
        />
      )}

      {isLogOpen && (
        <FullLogModal 
          logs={logs} 
          onClear={handleClearLogs} 
          onClose={handleLogClose} 
          isDarkMode={isDarkMode}
        />
      )}
    </>
  );
}