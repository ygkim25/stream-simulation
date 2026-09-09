import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import LoginScreen from './pages/LoginScreen';
import MainScreen from './pages/MainScreen';
import RealtimeScreen from './pages/RealtimeScreen';
import SimulationScreen from './pages/SimulationScreen';
import PlantMapScreen from './pages/PlantMapScreen';
import ReportScreen from './pages/ReportScreen';
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
  // 헤더의 알람 on/off 토글 - 꺼져 있으면 위험 알람이 와도 브라우저 알림을 안 띄움
  // (라우트 이동해도 유지돼야 해서 App에서 관리)
  const [isAlarmOn, setIsAlarmOn] = useState(true);

  // 다크모드 클래스 토글
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // 알람 on/off는 서버(Login.alarmEnable)에 저장돼 있으므로, 로그인 상태로 새로고침해도
  // 항상 켜짐으로 리셋되지 않도록 로그인된 유저가 있으면 저장된 값을 불러와 맞춰줌
  useEffect(() => {
    if (!user?.token) return;
    axios.get(`${API_BASE_URL}/api/employee/me`, {
      headers: { Authorization: `Bearer ${user.token}` },
    }).then(res => {
      setIsAlarmOn(res.data?.alarmEnable !== 'off');
    }).catch(err => {
      console.error('알람 설정 조회 실패:', err);
    });
  }, [user?.token]);

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

  // 401(로그인 만료/무효 토큰)이 오면 어디서 호출한 API든 자동으로 로그아웃시킴. 403(로그인은
  // 유효하지만 그 리소스에 대한 권한이 없음)은 다른 사람 소유 데이터 등 정상적인 상황일 수 있어서
  // 여기서 로그아웃시키면 안 됨 - 그건 각 화면에서 에러 메시지로만 보여줌.
  // ref로 최신 user/handleLogout을 참조해서, 인터셉터는 마운트 시 한 번만 등록함
  const userRef = useRef(user);
  const handleLogoutRef = useRef(handleLogout);
  useEffect(() => {
    userRef.current = user;
    handleLogoutRef.current = handleLogout;
  });
  useEffect(() => {
    const interceptorId = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error?.response?.status === 401 && userRef.current) {
          handleLogoutRef.current();
        }
        return Promise.reject(error);
      },
    );
    return () => axios.interceptors.response.eject(interceptorId);
  }, []);

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
          isAlarmOn={isAlarmOn}
          setIsAlarmOn={setIsAlarmOn}
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
          isAlarmOn={isAlarmOn}
          setIsAlarmOn={setIsAlarmOn}
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
          isAlarmOn={isAlarmOn}
          setIsAlarmOn={setIsAlarmOn}
        />
      )}

      {route === 'plantmap' && (
        <PlantMapScreen
          user={user}
          route={route}
          setRoute={setRoute}
          openMyPage={handleMyPageOpen}
          isDarkMode={isDarkMode}
          setIsDarkMode={setIsDarkMode}
          isAlarmOn={isAlarmOn}
          setIsAlarmOn={setIsAlarmOn}
        />
      )}

      {route === 'report' && (
        <ReportScreen
          user={user}
          route={route}
          setRoute={setRoute}
          openMyPage={handleMyPageOpen}
          isDarkMode={isDarkMode}
          setIsDarkMode={setIsDarkMode}
          isAlarmOn={isAlarmOn}
          setIsAlarmOn={setIsAlarmOn}
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