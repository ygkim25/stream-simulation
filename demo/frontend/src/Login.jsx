import { useState } from 'react';

function Login({ onLogin }) {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, password }),
      });

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || '로그인에 실패했습니다.');
      }

      const data = await res.json();
      // data: { token, userId, userName, divisionCode }

      sessionStorage.setItem('token', data.token);
      sessionStorage.setItem('userId', data.userId);
      sessionStorage.setItem('userName', data.userName);

      onLogin(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      background: '#f5f5f5'
    }}>
      <form onSubmit={handleSubmit} style={{
        background: '#fff',
        padding: '32px',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        width: '280px'
      }}>
        <h2 style={{ marginTop: 0, marginBottom: '20px', textAlign: 'center', color: '#000' }}>
          장비 모니터링 로그인
        </h2>

        <div style={{ marginBottom: '12px' }}>
          <input
            type="text"
            placeholder="아이디"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ marginBottom: '12px' }}>
          <input
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
          />
        </div>

        {error && (
          <div style={{ color: 'red', fontSize: '13px', marginBottom: '12px' }}>
            {error}
          </div>
        )}

        <button type="submit" disabled={loading} style={{
          width: '100%',
          padding: '10px',
          background: '#333',
          color: '#fff',
          border: 'none',
          borderRadius: '4px',
          cursor: loading ? 'not-allowed' : 'pointer'
        }}>
          {loading ? '로그인 중...' : '로그인'}
        </button>
      </form>
    </div>
  );
}

export default Login;