import React, { useState, useEffect } from 'react';
import axios from 'axios';
import LoginScreen from './pages/LoginScreen';
import MainScreen from './pages/MainScreen';
import RealtimeScreen from './pages/RealtimeScreen';
import SimulationScreen from './pages/SimulationScreen';
import MyPageModal from './components/MyPageModal'; 
import FullLogModal from './components/FullLogModal';
import { API_BASE_URL } from './utils/apiConfig';

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

  // 2. 세션 유무에 따라 초기 화면 라우트 설정 (메인 화면 안 거치고 바로 실시간 모니터링으로)
  const [route, setRoute] = useState(() => {
    const savedUser = sessionStorage.getItem('user');
    return savedUser ? 'realtime' : 'login';
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

  // 알람/로그 데이터 (RealtimeScreen 마운트 시 백엔드 noti-warn/logs API로 채워짐)
  const [alarms, setAlarms] = useState([]);
  const [logs, setLogs] = useState([]);

  // 로그인 처리
  const handleLogin = (userInfo) => {
    setUser(userInfo);
    if (userInfo) {
      sessionStorage.setItem('user', JSON.stringify(userInfo));
    }
    setRoute('realtime');
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
  // 전체 로그 팝업의 지금 탭(전체/온도/전력)에 맞춰 지움 - "전체"면 온도/전력 둘 다 지움
  const handleClearLogs = async (metric) => {
    const headers = user?.token ? { Authorization: `Bearer ${user.token}` } : {};
    const domains = metric === 'all' ? ['temp', 'elec'] : [metric === 'power' ? 'elec' : 'temp'];
    try {
      await Promise.all(domains.map(domain =>
        axios.post(`${API_BASE_URL}/api/live/monitoring/${domain}/logs/clear`, {}, { headers })
      ));
    } catch (err) {
      console.error('로그 초기화 실패:', err);
      return;
    }
    if (metric === 'all') {
      setLogs([]);
    } else {
      setLogs(prev => prev.filter(l => (l.metric || 'temperature') !== metric));
    }
  };

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
          route={route}
          setRoute={setRoute}
          openMyPage={handleMyPageOpen}
          isDarkMode={isDarkMode}
          setIsDarkMode={setIsDarkMode}
        />
      )}

      {route === 'realtime' && (
        <RealtimeScreen
          user={user}
          route={route}
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
          route={route}
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