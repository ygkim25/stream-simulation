import React, { useState, useEffect } from 'react';
import axios from 'axios';

// ==========================================
// 설정(Settings) 팝업 컴포넌트 (내 정보 / 비밀번호 / 사용자 조회)
// ==========================================
const MyPageModal = ({ user, onClose, onLogout, isDarkMode, initialTab }) => {
  // 탭 상태 관리 (info, password, auth)
  const [activeTab, setActiveTab] = useState(initialTab || 'info');

  // [탭 1] 내 정보 관련 State
  const [name, setName] = useState(user?.userName || '');
  const [dept, setDept] = useState(user?.divisionName || '');
  const [duty, setDuty] = useState(user?.responsibility || '');
  const [id, setId] = useState(user?.userId || 'admin');

  // [탭 2] 비밀번호 관련 State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // [탭 3] 사용자 조회 관련 State
  const [employees, setEmployees] = useState([]);
  const [isEmployeesLoading, setIsEmployeesLoading] = useState(false);

  // ★ 관리자 여부 확인
  const isAdmin = user?.role === 'ADMIN' || user?.userId === 'admin' || id === 'admin';

  // 모달 외부 클릭 시 닫기
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleLogoutClick = () => {
    if (window.confirm('로그아웃 하시겠습니까?')) {
      onLogout?.();
    }
  };

  // ★ [탭 2] 비밀번호 변경 처리 함수
  const handlePasswordSave = async () => {
    if (!currentPassword) return alert('현재 비밀번호를 입력해주세요.');
    if (!newPassword) return alert('새 비밀번호를 입력해주세요.');
    if (newPassword !== confirmPassword) return alert('새 비밀번호와 비밀번호 확인이 일치하지 않습니다.');

    try {
      await axios.post(
        'http://localhost:8086/api/auth/change-password',
        {
          currentPassword: currentPassword,
          newPassword: newPassword,
        },
        {
          headers: user?.token ? { Authorization: `Bearer ${user.token}` } : {},
        }
      );

      alert('비밀번호가 성공적으로 변경되었습니다.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      onClose();
    } catch (err) {
      console.error('비밀번호 변경 실패:', err);
      const serverMessage = err.response?.data?.message || '현재 비밀번호가 틀렸거나 오류가 발생했습니다.';
      alert(serverMessage);
    }
  };

  // ★ [탭 3] 사용자 조회 - 전 직원 목록 불러오기
  useEffect(() => {
    if (activeTab === 'auth' && employees.length === 0) {
      const fetchEmployees = async () => {
        setIsEmployeesLoading(true);
        try {
          const response = await axios.get('http://localhost:8086/api/users', {
            headers: user?.token ? { Authorization: `Bearer ${user.token}` } : {},
          });
          setEmployees(response.data || [
            { userId: 'admin', userName: '관리자', role: 'ADMIN' },
            { userId: 'user1', userName: '홍길동', role: 'USER' }
          ]);
        } catch (error) {
          console.error('직원 목록 조회 실패:', error);
          setEmployees([
            { userId: 'admin', userName: '시스템관리자', role: 'ADMIN' },
            { userId: 'hykang@wemb.co.kr', userName: '강희연', role: 'USER' },
            { userId: 'test_user', userName: '테스트계정', role: 'USER' }
          ]);
        } finally {
          setIsEmployeesLoading(false);
        }
      };
      fetchEmployees();
    }
  }, [activeTab, employees.length, user]);

  const handleRoleChange = (userId, newRole) => {
    if (window.confirm(`${userId}의 권한을 [${newRole}]로 변경하시겠습니까?`)) {
      alert('백엔드 연동 후 실제 권한이 변경됩니다.');
      setEmployees(prev => prev.map(emp => emp.userId === userId ? { ...emp, role: newRole } : emp));
    }
  };

  const handleDeleteUser = (userId) => {
    if (window.confirm(`${userId} 계정을 정말 삭제하시겠습니까?`)) {
      alert('백엔드 연동 후 실제 계정이 삭제됩니다.');
      setEmployees(prev => prev.filter(emp => emp.userId !== userId));
    }
  };

  // 공통 Input 스타일
  const inputClass = `w-full rounded-xl px-4 py-3.5 focus:outline-none text-[14px] transition-all box-border border ${
    isDarkMode 
      ? 'bg-[#0D1224] border-[#232B45] focus:border-[#22D3EE] text-[#EDF1FC] placeholder-[#5C6584]' 
      : 'bg-gray-50 border-gray-200 focus:border-green-600 text-gray-800 placeholder-gray-400'
  }`;

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4 transition-colors"
      style={{
        backgroundColor: isDarkMode ? 'rgba(5, 8, 16, 0.75)' : 'rgba(0, 0, 0, 0.4)',
        backdropFilter: 'blur(3px)',
      }}
      onClick={handleOverlayClick}
    >
      <div
        className={`w-full max-w-[650px] min-w-[340px] rounded-2xl shadow-2xl overflow-hidden flex flex-col border transition-all relative z-[100000] ${
          isDarkMode ? 'bg-[#12172A] border-[#232B45]' : 'bg-white border-gray-200'
        }`}
      >
        {/* 상단 헤더 */}
        <div className={`px-7 py-5 flex items-center justify-between border-b ${
          isDarkMode ? 'bg-[#0D1224] border-[#232B45] text-[#EDF1FC]' : 'bg-gray-50 border-gray-200 text-gray-800'
        }`}>
          <h2 className="text-[18px] font-bold tracking-tight m-0">설정</h2>
          <button
            onClick={onClose}
            className={`text-2xl leading-none transition-colors outline-none bg-transparent border-none cursor-pointer ${
              isDarkMode ? 'text-[#5C6584] hover:text-[#EDF1FC]' : 'text-gray-400 hover:text-gray-800'
            }`}
          >
            &times;
          </button>
        </div>

        {/* 커스텀 탭 메뉴 */}
        <div className={`flex border-b text-[14px] font-bold ${
          isDarkMode ? 'border-[#232B45] bg-[#0A0E1A]' : 'border-gray-200 bg-gray-50'
        }`}>
          <button
            onClick={() => setActiveTab('info')}
            className={`flex-1 py-4 text-center transition-colors relative cursor-pointer ${
              activeTab === 'info'
                ? (isDarkMode ? 'text-[#22D3EE]' : 'text-green-700')
                : (isDarkMode ? 'text-[#5C6584] hover:text-[#EDF1FC]' : 'text-gray-500 hover:text-gray-800')
            }`}
          >
            내 정보
            {activeTab === 'info' && (
              <span className={`absolute bottom-0 left-0 w-full h-0.5 ${isDarkMode ? 'bg-[#22D3EE]' : 'bg-green-600'}`} />
            )}
          </button>
          <button
            onClick={() => setActiveTab('password')}
            className={`flex-1 py-4 text-center transition-colors relative cursor-pointer ${
              activeTab === 'password'
                ? (isDarkMode ? 'text-[#22D3EE]' : 'text-green-700')
                : (isDarkMode ? 'text-[#5C6584] hover:text-[#EDF1FC]' : 'text-gray-500 hover:text-gray-800')
            }`}
          >
            비밀번호 변경
            {activeTab === 'password' && (
              <span className={`absolute bottom-0 left-0 w-full h-0.5 ${isDarkMode ? 'bg-[#22D3EE]' : 'bg-green-600'}`} />
            )}
          </button>
          <button
            onClick={() => setActiveTab('auth')}
            className={`flex-1 py-4 text-center transition-colors relative cursor-pointer ${
              activeTab === 'auth'
                ? (isDarkMode ? 'text-[#22D3EE]' : 'text-green-700')
                : (isDarkMode ? 'text-[#5C6584] hover:text-[#EDF1FC]' : 'text-gray-500 hover:text-gray-800')
            }`}
          >
            사용자 조회
            {activeTab === 'auth' && (
              <span className={`absolute bottom-0 left-0 w-full h-0.5 ${isDarkMode ? 'bg-[#22D3EE]' : 'bg-green-600'}`} />
            )}
          </button>
        </div>

        {/* 팝업 본문 */}
        <div className="p-7 md:p-8 flex flex-col min-h-[340px]">
          
          {/* [탭 1] 내 정보 */}
          {activeTab === 'info' && (
            <div className="flex flex-col gap-6 h-full justify-between animate-fade-in">
              <div className="space-y-4">
                <div>
                  <label className={`block text-xs font-bold mb-1 ${isDarkMode ? 'text-[#5C6584]' : 'text-gray-500'}`}>이름</label>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="이름" />
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={`block text-xs font-bold mb-1 ${isDarkMode ? 'text-[#5C6584]' : 'text-gray-500'}`}>부서</label>
                    <input type="text" value={dept} onChange={(e) => setDept(e.target.value)} className={inputClass} placeholder="부서명" />
                  </div>
                  <div>
                    <label className={`block text-xs font-bold mb-1 ${isDarkMode ? 'text-[#5C6584]' : 'text-gray-500'}`}>직급</label>
                    <input type="text" value={duty} onChange={(e) => setDuty(e.target.value)} className={inputClass} placeholder="직급" />
                  </div>
                </div>

                <div>
                  <label className={`block text-xs font-bold mb-1 ${isDarkMode ? 'text-[#5C6584]' : 'text-gray-500'}`}>계정 (ID)</label>
                  <input
                    type="text"
                    value={id}
                    readOnly
                    className={`w-full border rounded-xl px-4 py-3.5 font-mono text-[14px] cursor-not-allowed box-border ${
                      isDarkMode ? 'bg-[#0A0E1A] border-[#1E253D] text-[#5C6584]' : 'bg-gray-100 border-gray-200 text-gray-400'
                    }`}
                    placeholder="계정"
                  />
                </div>
              </div>
              <div className="pt-2">
                <button
                  onClick={handleLogoutClick}
                  className={`w-full font-bold py-3.5 rounded-xl transition-colors text-[14px] cursor-pointer border ${
                    isDarkMode ? 'bg-transparent hover:bg-[#FB5D75]/10 text-[#FB5D75] border-[#FB5D75]/30' : 'bg-transparent hover:bg-red-50 text-red-600 border-red-200'
                  }`}
                >
                  로그아웃
                </button>
              </div>
            </div>
          )}

          {/* [탭 2] 비밀번호 변경 */}
          {activeTab === 'password' && (
            <div className="flex flex-col gap-5 h-full justify-between animate-fade-in">
              <div className="space-y-4">
                <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className={inputClass} placeholder="현재 비밀번호" />
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={inputClass} placeholder="새 비밀번호" />
                <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={inputClass} placeholder="비밀번호 확인" />
              </div>
              <div className="mt-4">
                <button
                  onClick={handlePasswordSave}
                  className={`w-full font-bold py-3.5 rounded-xl transition-colors text-[15px] cursor-pointer border-none ${
                    isDarkMode ? 'bg-[#22D3EE] hover:bg-[#3FDCF0] text-[#0A0E1A]' : 'bg-green-700 hover:bg-green-800 text-white'
                  }`}
                >
                  비밀번호 저장
                </button>
              </div>
            </div>
          )}

          {/* [탭 3] 사용자 조회 */}
          {activeTab === 'auth' && (
            <div className="flex flex-col h-full animate-fade-in">
              <div className="flex items-center justify-between mb-4">
                <span className={`text-[13px] font-bold ${isDarkMode ? 'text-[#22D3EE]' : 'text-green-700'}`}>
                  전체 사용자 목록 (총 {employees.length}명)
                </span>
                {!isAdmin && (
                  <span className={`text-[12px] ${isDarkMode ? 'text-[#5C6584]' : 'text-gray-400'}`}>
                    * 수정/삭제 권한은 관리자 전용입니다.
                  </span>
                )}
              </div>
              
              <div className={`flex-1 overflow-y-auto pr-1 space-y-2.5 max-h-[340px] custom-scrollbar ${isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-800'}`}>
                {isEmployeesLoading ? (
                  <div className="text-center text-xs py-10 text-gray-400">데이터를 불러오는 중...</div>
                ) : employees.length === 0 ? (
                  <div className="text-center text-xs py-10 text-gray-400">등록된 사용자가 없습니다.</div>
                ) : (
                  employees.map((emp) => (
                    <div key={emp.userId} className={`flex items-center justify-between p-3.5 rounded-xl border ${
                      isDarkMode ? 'bg-[#0D1224] border-[#232B45]' : 'bg-gray-50 border-gray-200'
                    }`}>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[14px] font-bold">{emp.userName}</span>
                        <span className={`text-[12px] font-mono ${isDarkMode ? 'text-[#5C6584]' : 'text-gray-500'}`}>{emp.userId}</span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {isAdmin ? (
                          <>
                            <select
                              value={emp.role}
                              onChange={(e) => handleRoleChange(emp.userId, e.target.value)}
                              className={`text-[12px] font-bold px-3 py-1.5 rounded-lg outline-none border cursor-pointer ${
                                isDarkMode ? 'bg-[#12172A] border-[#2A335A] text-[#EDF1FC]' : 'bg-white border-gray-300 text-gray-700'
                              }`}
                            >
                              <option value="USER">일반</option>
                              <option value="ADMIN">관리자</option>
                            </select>
                            <button
                              onClick={() => handleDeleteUser(emp.userId)}
                              className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                                isDarkMode ? 'border-[#FB5D75]/30 text-[#FB5D75] hover:bg-[#FB5D75]/10' : 'border-red-200 text-red-500 hover:bg-red-50'
                              }`}
                              title="계정 삭제"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </>
                        ) : (
                          <span className={`text-[12px] font-semibold px-3 py-1 rounded-lg border ${
                            emp.role === 'ADMIN'
                              ? (isDarkMode ? 'bg-[#22D3EE]/10 border-[#22D3EE]/30 text-[#22D3EE]' : 'bg-green-50 border-green-200 text-green-700')
                              : (isDarkMode ? 'bg-[#1A223D] border-[#2A335A] text-[#8592AD]' : 'bg-gray-100 border-gray-200 text-gray-600')
                          }`}>
                            {emp.role === 'ADMIN' ? '관리자' : '일반'}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default MyPageModal;