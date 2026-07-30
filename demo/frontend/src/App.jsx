import { useEffect, useState } from 'react';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import Login from './Login';

function Dashboard({ userName, onLogout }) {
  const [equipmentList, setEquipmentList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const token = sessionStorage.getItem('token');

  // 1) 초기 데이터: REST API (토큰 헤더 포함)
  useEffect(() => {
    fetch('/api/equipment', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then((res) => {
        if (res.status === 401) {
          // 토큰 만료/무효 -> 로그아웃 처리
          onLogout();
          throw new Error('인증이 만료되었습니다. 다시 로그인해주세요.');
        }
        if (!res.ok) throw new Error('서버 응답 오류');
        return res.json();
      })
      .then((data) => {
        setEquipmentList(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  // 2) 실시간 갱신: WebSocket 구독
  useEffect(() => {
    const client = new Client({
      webSocketFactory: () => new SockJS('/ws'),
      connectHeaders: {
        Authorization: `Bearer ${token}`,
      },
      reconnectDelay: 5000,
      onConnect: () => {
        console.log('WebSocket 연결 성공');
        client.subscribe('/topic/equipment', (message) => {
          const data = JSON.parse(message.body);
          setEquipmentList(data);
        });
      },
      onStompError: (frame) => {
        console.error('STOMP 에러:', frame);
      },
    });

    client.activate();
    return () => client.deactivate();
  }, []);

  if (loading) return <div>로딩 중...</div>;
  if (error) return <div>에러 발생: {error}</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 style={{ margin: 0 }}>장비 현황 ({userName}님)</h3>
        <button onClick={onLogout}>로그아웃</button>
      </div>

      <table border="1" cellPadding="8">
        <thead>
          <tr>
            <th>장비 ID</th><th>장비명</th><th>온도</th><th>전력량</th>
            <th>임계값</th><th>상태</th><th>수신시간</th>
          </tr>
        </thead>
        <tbody>
          {equipmentList.map((eq) => (
            <tr key={eq.equipId}>
              <td>{eq.equipId}</td>
              <td>{eq.equipName}</td>
              <td>{eq.temperature}</td>
              <td>{eq.power}</td>
              <td>{eq.threshold}</td>
              <td style={{
                color: eq.status === '위험' ? 'red' : eq.status === '경고' ? 'orange' : 'green'
              }}>{eq.status}</td>
              <td>{eq.receivedAt}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function App() {
  const [userName, setUserName] = useState(sessionStorage.getItem('userName'));

  const handleLogin = (data) => {
    setUserName(data.userName);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('userId');
    sessionStorage.removeItem('userName');
    setUserName(null);
  };

  if (!userName) {
    return <Login onLogin={handleLogin} />;
  }

  return <Dashboard userName={userName} onLogout={handleLogout} />;
}

export default App;