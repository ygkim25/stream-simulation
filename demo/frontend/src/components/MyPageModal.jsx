import React, { useState, useEffect } from 'react';
import axios from 'axios';
import CustomAlert from './CustomAlert';
import CustomConfirm from './CustomConfirm';

// ==========================================
// 설정(Settings) 팝업 컴포넌트 (내 정보 / 비밀번호 / 사용자 조회)
// ==========================================
const MyPageModal = ({ user, onClose, onLogout, isDarkMode, initialTab }) => {
  // 탭 상태 관리 (info, password, auth)
  const [activeTab, setActiveTab] = useState(initialTab || 'info');

  // [탭 1] 내 정보 관련 State (읽기 전용 표시)
  const [name] = useState(user?.userName || '');
  const [dept] = useState(user?.divisionName || '');
  const [duty] = useState(user?.responsibility || '');
  const [id] = useState(user?.userId || 'admin');

  // [탭 2] 비밀번호 관련 State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // 크롬 기본 alert 대신 사용하는 커스텀 알림 메시지 (확인 버튼을 눌렀을 때 실행할 후속 동작도 함께 저장)
  const [alertMessage, setAlertMessage] = useState('');
  const [alertOnConfirm, setAlertOnConfirm] = useState(null);

  const showAlert = (message, onConfirm) => {
    setAlertMessage(message);
    setAlertOnConfirm(() => onConfirm || null);
  };

  const handleAlertClose = () => {
    setAlertMessage('');
    if (alertOnConfirm) {
      const callback = alertOnConfirm;
      setAlertOnConfirm(null);
      callback();
    }
  };

  // 크롬 기본 confirm 대신 사용하는 커스텀 확인 메시지
  const [confirmMessage, setConfirmMessage] = useState('');
  const [confirmCallback, setConfirmCallback] = useState(null);
  const askConfirm = (message, onConfirm) => {
    setConfirmMessage(message);
    setConfirmCallback(() => onConfirm);
  };
  const handleConfirmYes = () => {
    const callback = confirmCallback;
    setConfirmMessage('');
    setConfirmCallback(null);
    callback?.();
  };
  const handleConfirmNo = () => {
    setConfirmMessage('');
    setConfirmCallback(null);
  };

  // [탭 3] 사용자 조회 관련 State
  const [employees, setEmployees] = useState([]);
  const [isEmployeesLoading, setIsEmployeesLoading] = useState(false);
  const [employeeSearch, setEmployeeSearch] = useState('');

  // [탭 3] 관리자 - 사용자 인적사항 수정 State
  const [editingUserId, setEditingUserId] = useState(null);
  const [editForm, setEditForm] = useState({ userName: '', divisionName: '', responsibility: '', phone: '' });

  // ★ 관리자 여부 확인
  const isAdmin = user?.role === 'ADMIN' || user?.userId === 'admin' || id === 'admin';

  // ★ [탭 3] 사원 이름 검색 (쉼표로 구분하여 복수 검색)
  const searchKeywords = employeeSearch
    .split(',')
    .map((keyword) => keyword.trim())
    .filter(Boolean);

  const filteredEmployees = (searchKeywords.length === 0
    ? employees
    : employees.filter((emp) =>
        searchKeywords.some((keyword) => emp.userName?.includes(keyword))
      )
  ).slice().sort((a, b) => (a.userName || '').localeCompare(b.userName || '', 'ko'));

  // 모달 외부 클릭 시 닫기
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleLogoutClick = () => {
    askConfirm('로그아웃 하시겠습니까?', () => onLogout?.());
  };

  // ★ [탭 2] 비밀번호 변경 처리 함수
  const handlePasswordSave = async () => {
    setPasswordError('');
    if (!currentPassword) return setPasswordError('현재 비밀번호를 입력해주세요.');
    if (!newPassword) return setPasswordError('새 비밀번호를 입력해주세요.');
    if (newPassword !== confirmPassword) return setPasswordError('새 비밀번호와 비밀번호 확인이 일치하지 않습니다.');

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

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showAlert('비밀번호가 성공적으로 변경되었습니다.', onClose);
    } catch (err) {
      console.error('비밀번호 변경 실패:', err);
      const serverMessage = typeof err.response?.data === 'string'
        ? err.response.data
        : err.response?.data?.message;
      setPasswordError(serverMessage || '현재 비밀번호가 틀렸거나 오류가 발생했습니다.');
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
            { userId: 'admin', userName: '관리자', divisionName: '관제팀', responsibility: '팀장', role: 'ADMIN' },
            { userId: 'user1', userName: '홍길동', divisionName: '설비1팀', responsibility: '사원', role: 'USER' }
          ]);
        } catch (error) {
          console.error('직원 목록 조회 실패:', error);
          setEmployees([
            { userId: 'admin', userName: '시스템관리자', divisionName: '관제팀', responsibility: '팀장', role: 'ADMIN' },
            { userId: 'hykang@wemb.co.kr', userName: '강희연', divisionName: '개발팀', responsibility: '사원', role: 'USER' },
            { userId: 'test_user', userName: '테스트계정', divisionName: '설비1팀', responsibility: '사원', role: 'USER' }
          ]);
        } finally {
          setIsEmployeesLoading(false);
        }
      };
      fetchEmployees();
    }
  }, [activeTab, employees.length, user]);

  const handleRoleChange = (userId, newRole) => {
    const roleLabel = newRole === 'ADMIN' ? '관리자' : '일반';
    askConfirm(`${userId}의 권한을 [${roleLabel}]로 변경하시겠습니까?`, async () => {
      try {
        await axios.patch(
          `http://localhost:8086/api/users/${encodeURIComponent(userId)}/role`,
          { role: newRole },
          { headers: user?.token ? { Authorization: `Bearer ${user.token}` } : {} }
        );
        setEmployees(prev => prev.map(emp => emp.userId === userId ? { ...emp, role: newRole } : emp));
      } catch (err) {
        console.error('권한 변경 실패:', err);
        const serverMessage = typeof err.response?.data === 'string'
          ? err.response.data
          : err.response?.data?.message;
        showAlert(serverMessage || '권한 변경 중 오류가 발생했습니다.');
      }
    });
  };

  const handleDeleteUser = (userId) => {
    askConfirm(`${userId} 계정을 정말 삭제하시겠습니까?`, async () => {
      try {
        await axios.delete(
          `http://localhost:8086/api/users/${encodeURIComponent(userId)}`,
          { headers: user?.token ? { Authorization: `Bearer ${user.token}` } : {} }
        );
        setEmployees(prev => prev.filter(emp => emp.userId !== userId));
      } catch (err) {
        console.error('계정 삭제 실패:', err);
        const serverMessage = typeof err.response?.data === 'string'
          ? err.response.data
          : err.response?.data?.message;
        showAlert(serverMessage || '계정 삭제 중 오류가 발생했습니다.');
      }
    });
  };

  // ★ [탭 3] 관리자 - 다른 사용자 인적사항 수정
  const startEditUser = (emp) => {
    setEditingUserId(emp.userId);
    setEditForm({
      userName: emp.userName || '',
      divisionName: emp.divisionName || '',
      responsibility: emp.responsibility || '',
      phone: emp.phone || '',
    });
  };

  const cancelEditUser = () => {
    setEditingUserId(null);
  };

  const handleEditFieldChange = (field, value) => {
    setEditForm(prev => ({ ...prev, [field]: value }));
  };

  const saveEditUser = async (userId) => {
    if (!editForm.userName.trim()) {
      showAlert('이름을 입력해주세요.');
      return;
    }
    try {
      await axios.put(
        `http://localhost:8086/api/users/${encodeURIComponent(userId)}`,
        editForm,
        { headers: user?.token ? { Authorization: `Bearer ${user.token}` } : {} }
      );
      setEmployees(prev => prev.map(emp => emp.userId === userId ? { ...emp, ...editForm } : emp));
      setEditingUserId(null);
    } catch (err) {
      console.error('사용자 정보 수정 실패:', err);
      const serverMessage = typeof err.response?.data === 'string'
        ? err.response.data
        : err.response?.data?.message;
      showAlert(serverMessage || '사용자 정보 수정 중 오류가 발생했습니다.');
    }
  };

  // 공통 Input 스타일
  const inputClass = `w-full rounded-xl px-4 py-3.5 focus:outline-none text-[14px] transition-all box-border border ${
    isDarkMode
      ? 'bg-[#0D1224] border-[#232B45] focus:border-[#22D3EE] text-[#EDF1FC] placeholder-[#5C6584]'
      : 'bg-gray-50 border-gray-200 focus:border-green-600 text-gray-800 placeholder-gray-400'
  }`;

  // 읽기 전용 Input 스타일 (클릭/포커스 시 테마 색상 border로 표시)
  const readOnlyInputClass = `w-full rounded-xl px-4 py-3.5 focus:outline-none text-[14px] transition-colors box-border border cursor-not-allowed ${
    isDarkMode
      ? 'bg-[#0A0E1A] border-[#1E253D] text-[#7D87A8] focus:border-[#22D3EE]/50'
      : 'bg-gray-100 border-gray-200 text-gray-400 focus:border-green-500/50'
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
              isDarkMode ? 'text-[#7D87A8] hover:text-[#EDF1FC]' : 'text-gray-400 hover:text-gray-800'
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
                : (isDarkMode ? 'text-[#7D87A8] hover:text-[#EDF1FC]' : 'text-gray-500 hover:text-gray-800')
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
                : (isDarkMode ? 'text-[#7D87A8] hover:text-[#EDF1FC]' : 'text-gray-500 hover:text-gray-800')
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
                : (isDarkMode ? 'text-[#7D87A8] hover:text-[#EDF1FC]' : 'text-gray-500 hover:text-gray-800')
            }`}
          >
            사용자 조회
            {activeTab === 'auth' && (
              <span className={`absolute bottom-0 left-0 w-full h-0.5 ${isDarkMode ? 'bg-[#22D3EE]' : 'bg-green-600'}`} />
            )}
          </button>
        </div>

        {/* 팝업 본문 (탭 전환/검색 시에도 높이가 바뀌지 않도록 고정) */}
        <div className="p-7 md:p-8 flex flex-col h-[440px]">
          
          {/* [탭 1] 내 정보 */}
          {activeTab === 'info' && (
            <div className="flex flex-col gap-6 h-full justify-between animate-fade-in">
              <div className="space-y-4">
                <div>
                  <label className={`block text-xs font-bold mb-1 ${isDarkMode ? 'text-[#7D87A8]' : 'text-gray-500'}`}>이름</label>
                  <input type="text" value={name} readOnly className={readOnlyInputClass} placeholder="이름" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={`block text-xs font-bold mb-1 ${isDarkMode ? 'text-[#7D87A8]' : 'text-gray-500'}`}>부서</label>
                    <input type="text" value={dept} readOnly className={readOnlyInputClass} placeholder="부서명" />
                  </div>
                  <div>
                    <label className={`block text-xs font-bold mb-1 ${isDarkMode ? 'text-[#7D87A8]' : 'text-gray-500'}`}>직급</label>
                    <input type="text" value={duty} readOnly className={readOnlyInputClass} placeholder="직급" />
                  </div>
                </div>

                <div>
                  <label className={`block text-xs font-bold mb-1 ${isDarkMode ? 'text-[#7D87A8]' : 'text-gray-500'}`}>계정 (ID)</label>
                  <input
                    type="text"
                    value={id}
                    readOnly
                    className={`${readOnlyInputClass} font-mono`}
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
                <input type="password" value={currentPassword} onChange={(e) => { setCurrentPassword(e.target.value); setPasswordError(''); }} className={inputClass} placeholder="현재 비밀번호" />
                <input type="password" value={newPassword} onChange={(e) => { setNewPassword(e.target.value); setPasswordError(''); }} className={inputClass} placeholder="새 비밀번호" />
                <input type="password" value={confirmPassword} onChange={(e) => { setConfirmPassword(e.target.value); setPasswordError(''); }} className={inputClass} placeholder="비밀번호 확인" />
                {passwordError && (
                  <p className="text-[#FB5D75] text-xs font-semibold whitespace-pre-line">
                    {passwordError}
                  </p>
                )}
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
              <div className="flex items-center justify-between gap-3 mb-4">
                <input
                  type="text"
                  value={employeeSearch}
                  onChange={(e) => setEmployeeSearch(e.target.value)}
                  placeholder="사원 이름 검색 (쉼표로 복수 검색)"
                  className={`flex-1 min-w-0 rounded-lg px-3 py-2 text-[13px] outline-none border transition-colors ${
                    isDarkMode
                      ? 'bg-[#0D1224] border-[#232B45] focus:border-[#22D3EE] text-[#EDF1FC] placeholder-[#5C6584]'
                      : 'bg-gray-50 border-gray-200 focus:border-green-600 text-gray-800 placeholder-gray-400'
                  }`}
                />
                <span className={`shrink-0 text-[13px] font-bold ${isDarkMode ? 'text-[#22D3EE]' : 'text-green-700'}`}>
                  전체 사용자 목록 (총 {employees.length}명)
                </span>
              </div>
              {!isAdmin && (
                <div className={`text-right text-[12px] mb-3 -mt-2 ${isDarkMode ? 'text-[#7D87A8]' : 'text-gray-400'}`}>
                  * 수정/삭제 권한은 관리자 전용입니다.
                </div>
              )}

              <div className={`flex-1 overflow-y-auto pr-1 space-y-2.5 custom-scrollbar ${isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-800'}`}>
                {isEmployeesLoading ? (
                  <div className="col-span-full text-center text-xs py-10 text-gray-400">데이터를 불러오는 중...</div>
                ) : employees.length === 0 ? (
                  <div className="col-span-full text-center text-xs py-10 text-gray-400">등록된 사용자가 없습니다.</div>
                ) : filteredEmployees.length === 0 ? (
                  <div className="col-span-full text-center text-xs py-10 text-gray-400">검색 결과가 없습니다.</div>
                ) : (
                  filteredEmployees.map((emp) => {
                    // admin 계정은 role 값이 비어있어도(DB 미설정) 항상 관리자로 표시
                    const empIsAdmin = emp.role === 'ADMIN' || emp.userId === 'admin';
                    const isEditing = editingUserId === emp.userId;
                    const smallInputClass = `w-full rounded-lg px-2.5 py-1.5 text-[12px] outline-none border transition-colors ${
                      isDarkMode
                        ? 'bg-[#12172A] border-[#2A335A] focus:border-[#22D3EE] text-[#EDF1FC] placeholder-[#5C6584]'
                        : 'bg-white border-gray-300 focus:border-green-600 text-gray-800 placeholder-gray-400'
                    }`;

                    if (isEditing) {
                      return (
                        <div key={emp.userId} className={`p-3.5 rounded-xl border space-y-2 ${
                          isDarkMode ? 'bg-[#0D1224] border-[#22D3EE]/40' : 'bg-gray-50 border-green-300'
                        }`}>
                          <span className={`text-[12px] font-mono truncate block ${isDarkMode ? 'text-[#7D87A8]' : 'text-gray-500'}`}>{emp.userId}</span>
                          <div className="grid grid-cols-2 gap-2">
                            <input value={editForm.userName} onChange={(e) => handleEditFieldChange('userName', e.target.value)} placeholder="이름" className={smallInputClass} />
                            <input value={editForm.phone} onChange={(e) => handleEditFieldChange('phone', e.target.value)} placeholder="전화번호" className={smallInputClass} />
                            <input value={editForm.divisionName} onChange={(e) => handleEditFieldChange('divisionName', e.target.value)} placeholder="부서" className={smallInputClass} />
                            <input value={editForm.responsibility} onChange={(e) => handleEditFieldChange('responsibility', e.target.value)} placeholder="직급" className={smallInputClass} />
                          </div>
                          <div className="flex gap-2 justify-end pt-1">
                            <button
                              onClick={cancelEditUser}
                              className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors cursor-pointer border ${
                                isDarkMode ? 'border-[#232B45] text-[#9FACC9] hover:bg-[#151B30]' : 'border-gray-200 text-gray-600 hover:bg-gray-100'
                              }`}
                            >
                              취소
                            </button>
                            <button
                              onClick={() => saveEditUser(emp.userId)}
                              className={`px-3 py-1.5 rounded-lg text-[12px] font-bold transition-colors cursor-pointer border-none ${
                                isDarkMode ? 'bg-[#22D3EE] hover:bg-[#3FDCF0] text-[#0A0E1A]' : 'bg-green-700 hover:bg-green-800 text-white'
                              }`}
                            >
                              저장
                            </button>
                          </div>
                        </div>
                      );
                    }

                    return (
                    <div key={emp.userId} className={`flex items-center justify-between gap-2 p-3.5 rounded-xl border ${
                      isDarkMode ? 'bg-[#0D1224] border-[#232B45]' : 'bg-gray-50 border-gray-200'
                    }`}>
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-[14px] font-bold truncate">{emp.userName}</span>
                        <span className={`text-[11px] font-normal truncate ${isDarkMode ? 'text-[#9FACC9]' : 'text-gray-500'}`}>
                          {emp.divisionName || '-'} · {emp.responsibility || '-'}
                        </span>
                        <span className={`text-[12px] font-mono truncate ${isDarkMode ? 'text-[#7D87A8]' : 'text-gray-500'}`}>{emp.userId}</span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isAdmin ? (
                          <>
                            <select
                              value={empIsAdmin ? 'ADMIN' : 'USER'}
                              onChange={(e) => handleRoleChange(emp.userId, e.target.value)}
                              disabled={emp.userId === 'admin'}
                              className={`text-[12px] font-bold px-3 py-1.5 rounded-lg outline-none border cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                                isDarkMode ? 'bg-[#12172A] border-[#2A335A] text-[#EDF1FC]' : 'bg-white border-gray-300 text-gray-700'
                              }`}
                            >
                              <option value="USER">일반</option>
                              <option value="ADMIN">관리자</option>
                            </select>
                            <button
                              onClick={() => startEditUser(emp)}
                              className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                                isDarkMode ? 'border-[#2A335A] text-[#9FACC9] hover:bg-[#151B30] hover:text-[#EDF1FC]' : 'border-gray-200 text-gray-500 hover:bg-gray-100 hover:text-gray-800'
                              }`}
                              title="인적사항 수정"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
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
                            empIsAdmin
                              ? (isDarkMode ? 'bg-[#22D3EE]/10 border-[#22D3EE]/30 text-[#22D3EE]' : 'bg-green-50 border-green-200 text-green-700')
                              : (isDarkMode ? 'bg-[#1A223D] border-[#2A335A] text-[#9FACC9]' : 'bg-gray-100 border-gray-200 text-gray-600')
                          }`}>
                            {empIsAdmin ? '관리자' : '일반'}
                          </span>
                        )}
                      </div>
                    </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

        </div>
      </div>

      <CustomAlert message={alertMessage} onClose={handleAlertClose} isDarkMode={isDarkMode} />
      <CustomConfirm message={confirmMessage} onConfirm={handleConfirmYes} onCancel={handleConfirmNo} isDarkMode={isDarkMode} />
    </div>
  );
};

export default MyPageModal;