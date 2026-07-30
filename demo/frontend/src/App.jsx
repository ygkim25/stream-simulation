import React, { useState, useEffect } from 'react';
import LoginScreen from './pages/LoginScreen';
import MainScreen from './pages/MainScreen';
import RealtimeScreen from './pages/RealtimeScreen';
import MyPageModal from './components/MyPageModal'; 
import FullLogModal from './components/FullLogModal';

// ==========================================
// 최상위 App 컴포넌트
// ==========================================
export default function App() {
  const [route, setRoute] = useState('login');
  const [user, setUser] = useState(null);
  
  const [isMyPageOpen, setIsMyPageOpen] = useState(false);
  const [isLogOpen, setIsLogOpen] = useState(false); 

  const [alarms, setAlarms] = useState([
    { id: 1, equipName: '압축기 D', time: '15:14:02', value: 105.8, threshold: 100, location: '3구역 / 설비3팀' },
    { id: 2, equipName: '냉각 팬 B', time: '15:10:45', value: 65.0, threshold: 60, location: '1구역 / 설비1팀' },
  ]);

  const [logs, setLogs] = useState([
    { id: 100, time: '09:00:00', type: 'info', equipName: '시스템', message: '오전 관제 모니터링 시스템 기동 완료.' },
    { id: 101, time: '09:05:12', type: 'info', equipName: '시스템', message: 'DB 동기화 완료 및 실시간 데이터 수신 시작.' },
    { id: 102, time: '09:15:30', type: 'info', equipName: '메인 펌프 A', message: '초기 가동 점검 정상 확인.' },
    { id: 103, time: '10:22:15', type: 'warning', equipName: '냉각 팬 B', message: '회전수 미세 감소 감지. 모니터링 강화 설정.', value: 58.2, threshold: 60 },
    { id: 104, time: '10:45:00', type: 'success', equipName: '냉각 팬 B', message: '회전수 정상 범위로 자체 복구됨.' },
    { id: 105, time: '11:30:00', type: 'info', equipName: '시스템', message: '오전 정기 리포트 생성 완료.' },
    { id: 106, time: '12:05:40', type: 'warning', equipName: '열교환기 E', message: '냉각수 온도 상승 추이 확인.', value: 48.5, threshold: 50 },
    { id: 107, time: '12:15:22', type: 'warning', equipName: '열교환기 E', message: '냉각수 온도 임계치 근접. 주의 요망.', value: 49.8, threshold: 50 },
    { id: 108, time: '12:20:10', type: 'warning', equipName: '열교환기 E', message: '냉각수 온도 임계치 돌파. 냉각 밸브 자동 개방.', value: 51.2, threshold: 50 },
    { id: 109, time: '12:35:55', type: 'success', equipName: '열교환기 E', message: '냉각수 온도 정상 수치로 복귀. 밸브 제어 해제.' },
    { id: 110, time: '13:00:00', type: 'info', equipName: '시스템', message: '오후 관제 모니터링 시작.' },
    { id: 111, time: '13:10:05', type: 'info', equipName: '보조 발전기 C', message: '정기 자체 진단 테스트 시작.' },
    { id: 112, time: '13:15:00', type: 'success', equipName: '보조 발전기 C', message: '진단 테스트 통과. 이상 없음.' },
    { id: 113, time: '14:28:15', type: 'warning', equipName: '열교환기 E', message: '순간적인 압력 상승 감지. 주의 요망.', value: 52.1, threshold: 50 },
    { id: 114, time: '14:30:00', type: 'info', equipName: '시스템', message: '사용자(admin)가 로그인했습니다.' },
    { id: 115, time: '14:45:30', type: 'warning', equipName: '메인 펌프 A', message: '진동 수치 비정상 패턴 감지.', value: 81.5, threshold: 80 },
    { id: 116, time: '14:48:12', type: 'warning', equipName: '메인 펌프 A', message: '진동 수치 지속 초과. 경고 알람 발송.', value: 83.2, threshold: 80 },
    { id: 117, time: '15:05:10', type: 'success', equipName: '메인 펌프 A', message: '수동 조작으로 펌프 압력 및 진동 정상화되었습니다.' },
    { id: 118, time: '15:10:45', type: 'warning', equipName: '냉각 팬 B', message: '온도 상승으로 인한 임계값 초과 경고 발생.', value: 65.0, threshold: 60 },
    { id: 119, time: '15:12:30', type: 'warning', equipName: '압축기 D', message: '입력 전압 불안정 감지. 가동 중지 대기 상태.', value: 98.5, threshold: 100 },
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

  // 로그인 성공 핸들러
  const handleLogin = (userInfo) => {
    setUser(userInfo);
    setRoute('main');
  };

  const handleMyPageOpen = () => setIsMyPageOpen(true);
  const handleMyPageClose = () => setIsMyPageOpen(false);
  const handleLogOpen = () => setIsLogOpen(true);
  const handleLogClose = () => setIsLogOpen(false);
  const handleClearLogs = () => setLogs([]);

  return (
    <>
      {route === 'login' && <LoginScreen onLogin={handleLogin} />}
      {route === 'main' && <MainScreen user={user} setRoute={setRoute} openMyPage={handleMyPageOpen} />}
      {route === 'realtime' && <RealtimeScreen user={user} setRoute={setRoute} openMyPage={handleMyPageOpen} alarms={alarms} setAlarms={setAlarms} openLogs={handleLogOpen} />}
      {isMyPageOpen && <MyPageModal user={user} onClose={handleMyPageClose} />}
      {isLogOpen && <FullLogModal logs={logs} onClear={handleClearLogs} onClose={handleLogClose} />}
    </>
  );
}