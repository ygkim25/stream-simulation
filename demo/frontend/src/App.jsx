import React, { useState, useEffect } from 'react';
import LoginScreen from './pages/LoginScreen';
import MainScreen from './pages/MainScreen';
import RealtimeScreen from './pages/RealtimeScreen';
import MyPageModal from './components/MyPageModal'; 
import FullLogModal from './components/FullLogModal';

export default function App() {
  const [route, setRoute] = useState('login');
  const [user, setUser] = useState(null);
  
  const [isMyPageOpen, setIsMyPageOpen] = useState(false);
  const [isLogOpen, setIsLogOpen] = useState(false); 

  const [isDarkMode, setIsDarkMode] = useState(true);

  // 다크모드 클래스 토글 (CSS 스크롤바 & 테마 연동)
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // ==========================================
  // [NEW] 설비(Equipment) 목업 데이터
  // ==========================================
const [equipments, setEquipments] = useState([
  { id: 1, equipName: '메인 펌프 A', status: 'RUNNING', temp: 42.5, vibration: 12.1, pressure: 5.2, location: '1구역 / 설비1팀' },
  { id: 2, equipName: '냉각 팬 B', status: 'WARNING', temp: 65.0, vibration: 28.4, pressure: 2.1, location: '1구역 / 설비1팀' },
  { id: 3, equipName: '보조 발전기 C', status: 'RUNNING', temp: 38.2, vibration: 8.5, pressure: 0.0, location: '2구역 / 설비2팀' },
  { id: 4, equipName: '압축기 D', status: 'STOP', temp: 105.8, vibration: 45.2, pressure: 12.8, location: '3구역 / 설비3팀' },
  { id: 5, equipName: '열교환기 E', status: 'WARNING', temp: 48.5, vibration: 10.2, pressure: 4.8, location: '2구역 / 설비2팀' },
  { id: 6, equipName: '유압 유닛 F', status: 'RUNNING', temp: 41.0, vibration: 11.0, pressure: 8.4, location: '1구역 / 설비1팀' },
  { id: 7, equipName: '송풍기 G', status: 'RUNNING', temp: 36.8, vibration: 7.2, pressure: 1.5, location: '3구역 / 설비3팀' },
  { id: 8, equipName: '가스 터빈 H', status: 'STOP', temp: 22.0, vibration: 0.0, pressure: 0.0, location: '특수구역 / 발전팀' },
  { id: 9, equipName: '순환 펌프 I', status: 'RUNNING', temp: 44.1, vibration: 14.3, pressure: 4.2, location: '2구역 / 설비2팀' },
  { id: 10, equipName: '흡착식 건조기 J', status: 'RUNNING', temp: 32.5, vibration: 5.1, pressure: 6.0, location: '3구역 / 설비3팀' },
  { id: 11, equipName: '보일러 K', status: 'WARNING', temp: 88.4, vibration: 31.0, pressure: 15.2, location: '열원지구 / 설비3팀' },
  { id: 12, equipName: '냉동기 L', status: 'RUNNING', temp: 12.4, vibration: 9.8, pressure: 3.1, location: '1구역 / 설비1팀' },
  { id: 13, equipName: '변압기 M', status: 'RUNNING', temp: 55.2, vibration: 2.1, pressure: 0.0, location: '변전실 / 전기팀' },
  { id: 14, equipName: '배수 펌프 N', status: 'STOP', temp: 21.5, vibration: 0.0, pressure: 0.0, location: '지하층 / 시설팀' },
  { id: 15, equipName: '공조기 O', status: 'RUNNING', temp: 24.8, vibration: 6.4, pressure: 1.1, location: '옥상 / 시설팀' },
  { id: 16, equipName: '집진기 P', status: 'WARNING', temp: 51.0, vibration: 26.7, pressure: 3.5, location: '3구역 / 환경팀' },
  { id: 17, equipName: '벨트 컨베이어 Q', status: 'RUNNING', temp: 39.4, vibration: 18.2, pressure: 0.0, location: '물류동 / 운용팀' },
  { id: 18, equipName: '에어 드라이어 R', status: 'RUNNING', temp: 29.1, vibration: 4.8, pressure: 5.8, location: '2구역 / 설비2팀' },
  { id: 19, equipName: '감속기 S', status: 'RUNNING', temp: 47.3, vibration: 15.9, pressure: 2.4, location: '1구역 / 설비1팀' },
  { id: 20, equipName: '비상 발전기 T', status: 'STOP', temp: 19.8, vibration: 0.0, pressure: 0.0, location: '비상동 / 전기팀' },
]);

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

  // 세션 검증
  useEffect(() => {
    const token = sessionStorage.getItem('token');
    const userId = sessionStorage.getItem('userId');
    const userName = sessionStorage.getItem('userName');
    const divisionCode = sessionStorage.getItem('divisionCode');

    if (token && userId) {
      setUser({ userId, userName, token, divisionCode });
      setRoute('main');
    }
  }, []);

  const handleLogin = (userInfo) => {
    setUser(userInfo);
    if (userInfo?.token) {
      sessionStorage.setItem('token', userInfo.token);
      sessionStorage.setItem('userId', userInfo.userId);
      sessionStorage.setItem('userName', userInfo.userName || '');
      sessionStorage.setItem('divisionCode', userInfo.divisionCode || '');
    }
    setRoute('main');
  };

  const handleLogout = () => {
    sessionStorage.clear();
    setUser(null);
    setIsMyPageOpen(false);
    setRoute('login');
  };

  const handleMyPageOpen = () => setIsMyPageOpen(true);
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
          equipments={equipments} /* Props 전달 */
          isDarkMode={isDarkMode} 
          setIsDarkMode={setIsDarkMode} 
        />
      )}

      {route === 'realtime' && (
        <RealtimeScreen 
          user={user} 
          setRoute={setRoute} 
          openMyPage={handleMyPageOpen} 
          equipments={equipments} /* Props 전달 */
          setEquipments={setEquipments}
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