import React, { useState, useEffect } from 'react';
import LoginScreen from './pages/LoginScreen';
import MainScreen from './pages/MainScreen';
import RealtimeScreen from './pages/RealtimeScreen';
import SimulationScreen from './pages/SimulationScreen';
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

  const [isDarkMode, setIsDarkMode] = useState(false);

  // 다크모드 클래스 토글
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // 알람 데이터 (RealtimeScreen에서 백엔드 noti-warn API 기준으로 채움)
  // 새로고침해도 바로 비어보이지 않도록 localStorage에 저장/복원 (재연결 시 백엔드 데이터로 다시 동기화됨)
  const ALARMS_STORAGE_KEY = 'monitoringAlarms';
  const [alarms, setAlarms] = useState(() => {
    try {
      const saved = localStorage.getItem(ALARMS_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error('알람 복원 실패:', e);
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(ALARMS_STORAGE_KEY, JSON.stringify(alarms));
    } catch (e) {
      console.error('알람 저장 실패:', e);
    }
  }, [alarms]);

  // 로그 데이터 (RealtimeScreen에서 실시간 웹소켓 스트림 기준으로 채움)
  // 새로고침해도 이력이 사라지지 않도록 localStorage에 저장/복원
  const LOGS_STORAGE_KEY = 'monitoringLogs';
  const [logs, setLogs] = useState(() => {
    try {
      const saved = localStorage.getItem(LOGS_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error('로그 복원 실패:', e);
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(LOGS_STORAGE_KEY, JSON.stringify(logs));
    } catch (e) {
      console.error('로그 저장 실패:', e);
    }
  }, [logs]);

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
          setLogs={setLogs}
          openLogs={handleLogOpen}
          isDarkMode={isDarkMode}
          setIsDarkMode={setIsDarkMode}
        />
      )}

      {route === 'simulation' && (
        <SimulationScreen
          user={user}
          setRoute={setRoute}
          openMyPage={handleMyPageOpen}
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