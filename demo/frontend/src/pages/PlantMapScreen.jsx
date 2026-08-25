import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Client } from '@stomp/stompjs';
import Header from '../components/Header';
import CustomAlert from '../components/CustomAlert';
import CustomConfirm from '../components/CustomConfirm';
import EquipmentHistoryModal from '../components/EquipmentHistoryModal';
import { getStatusMeta } from '../utils/statusStyles';
import { API_BASE_URL, WS_BASE_URL } from '../utils/apiConfig';
import { EMPTY_EQUIP_ROW, mergeTempDto, mergeElecDto, mergeEquipmentLists } from '../utils/equipmentMerge';
import { saveToDB } from '../utils/indexedDb';

// 배치도 이미지/좌표는 백엔드 없이 이 브라우저에만 저장함 (카드 순서 저장과 동일한 패턴) -
// 다른 기기/사용자와는 공유되지 않지만, 여러 사용자가 같은 배치도를 봐야 하는 시점이 오면 그때
// 백엔드 테이블로 옮기면 됨
const IMAGE_KEY = 'plantMapImage';
const POSITIONS_KEY = 'plantMapPositions';
const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // localStorage 용량 보호용 상한

const loadStoredImage = () => {
  try { return localStorage.getItem(IMAGE_KEY) || null; } catch { return null; }
};
const loadStoredPositions = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(POSITIONS_KEY));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch { return {}; }
};
const savePositions = (positions) => {
  try { localStorage.setItem(POSITIONS_KEY, JSON.stringify(positions)); } catch {
    // localStorage를 못 쓰는 환경이면 이번 세션 동안만(메모리) 위치가 유지됨
  }
};

const STATUS_DOT_CLASS = { green: 'bg-green-500', amber: 'bg-amber-500', red: 'bg-red-500' };

const PlantMapScreen = ({ user, route, setRoute, openMyPage, isDarkMode, setIsDarkMode, isAlarmOn, setIsAlarmOn }) => {
  const [equipments, setEquipments] = useState([]);
  const [image, setImage] = useState(() => loadStoredImage());
  const [positions, setPositions] = useState(() => loadStoredPositions());
  const [isEditMode, setIsEditMode] = useState(false);
  const [metricTab, setMetricTab] = useState('temperature');
  const [selectedEquipId, setSelectedEquipId] = useState(null);
  const [alertMessage, setAlertMessage] = useState('');
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [isFileDragOver, setIsFileDragOver] = useState(false);
  // 정렬용 다중 선택 - 순서 있는 배열로 들고 있어서 맨 처음 선택한 설비를 기준선으로 씀
  const [multiSelectedIds, setMultiSelectedIds] = useState([]);
  // 좌표(%)는 도면 "이미지가 실제로 그려지는 영역" 기준인데, object-contain은 컨테이너와 이미지의
  // 가로세로 비율이 다르면 여백(레터박스)이 생겨서 컨테이너 크기 % 그대로 쓰면 편집모드 진입 시
  // 툴바/트레이가 붙었다 떨어지며 컨테이너 비율이 바뀔 때마다 마커가 이미지 위에서 밀려 보였음.
  // 그래서 컨테이너 실제 크기 + 이미지 원본 비율을 같이 들고 있다가, 실제 이미지가 그려지는
  // 사각형(오프셋 포함)을 직접 계산해서 그 기준으로 좌표를 넣고 뺌
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [naturalSize, setNaturalSize] = useState(null);
  // 설비 배치(칩 -> 도면, 또는 이미 배치된 마커 재배치)는 HTML5 draggable 대신 포인터 이벤트로 직접
  // 구현함 - draggable은 브라우저가 그려주는 고스트 이미지 위치가 실제 커서와 어긋나기 쉽고,
  // 드롭 전까지 정확히 어디에 놓일지 실시간으로 안 보여서 "어긋나게 배치된다"는 문제가 있었음.
  // 포인터 이벤트로 직접 좌표를 계산하면 커서를 그대로 따라다니는 미리보기를 보여줄 수 있음
  const [dragEquipId, setDragEquipId] = useState(null);
  // 렌더링 중엔 ref(mapRef.current)를 못 읽으므로(react-hooks/refs 규칙), 좌표 변환은 항상
  // 이벤트 핸들러 안에서 미리 끝내고 그 결과(%)만 상태로 들고 있다가 렌더링에 씀
  const [dragPreviewPct, setDragPreviewPct] = useState(null); // {xPct, yPct} | null (도면 밖이면 null)
  const dragEquipIdRef = useRef(null);
  // 다중 선택된 것 중 하나를 그냥(수식키 없이) 누르면 선택된 것들을 통째로 같이 옮김 - 서로
  // 간의 상대 위치(간격)는 그대로 유지한 채 델타(이동량)만 전부에 똑같이 적용
  const [isGroupDragging, setIsGroupDragging] = useState(false);
  const [groupDragPreview, setGroupDragPreview] = useState(null); // { [equipId]: {xPct, yPct} } | null
  const groupDragRef = useRef(null); // { startPct, startPositions } - 이벤트 핸들러 전용, 렌더링에선 안 씀

  const mapRef = useRef(null);
  const fileInputRef = useRef(null);
  // dragenter/dragleave는 자식 요소 경계를 넘나들 때도 계속 발생해서, 단순 불리언으로만
  // 관리하면 자식 위를 지날 때마다 하이라이트가 깜빡임 - 진입/이탈 횟수를 세서 0일 때만 끔
  const dragCounterRef = useRef(0);

  // OS 파일 탐색기에서 끌어온 파일 드래그인지 판별 (설비 칩 드래그는 dataTransfer에 파일이 없음)
  const isFileDrag = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');

  const handleDragEnterZone = (e) => {
    if (!isEditMode || !isFileDrag(e)) return;
    e.preventDefault();
    dragCounterRef.current += 1;
    setIsFileDragOver(true);
  };
  const handleDragLeaveZone = () => {
    if (dragCounterRef.current === 0) return;
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) setIsFileDragOver(false);
  };
  const resetFileDragState = () => {
    dragCounterRef.current = 0;
    setIsFileDragOver(false);
  };

  // 도면 컨테이너 크기를 실시간으로 추적 (편집모드 토글로 툴바/트레이가 붙었다 떨어지거나
  // 창 크기가 바뀔 때마다 다시 계산되어야 함) - mapRef는 이미지가 있을 때만 마운트되므로 image를
  // deps에 넣어 이미지가 새로 생길 때 다시 관찰을 붙임
  useEffect(() => {
    const el = mapRef.current;
    if (!el) return undefined;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setContainerSize({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [image]);

  // object-contain 규칙대로 "컨테이너 중 실제 이미지가 차지하는 영역"을 비율(0~1)로 계산.
  // 절대 px가 아니라 비율만 다루는 이유: 컨테이너 실제 px 크기는 ResizeObserver(레이아웃 단계)로,
  // 클릭 좌표는 clientX/Y+getBoundingClientRect(화면 단계)로 서로 다른 경로로 얻는데, 이 프로젝트가
  // index.css에서 html { zoom: 1.1 }을 쓰고 있어서 두 경로가 서로 다른 배율로 값을 줄 수 있음.
  // 절대 px끼리 섞어서 계산하면(예전 방식) 원점에서 멀수록 오차가 커지는 어긋남이 생겼는데,
  // 컨테이너 자신의 가로세로 "비율"(cw/ch)만 쓰면 그 배율 차이가 분자/분모에서 그대로 상쇄돼
  // zoom과 무관하게 항상 정확함
  const getImageBoxRatio = () => {
    const { width: cw, height: ch } = containerSize;
    if (!cw || !ch || !naturalSize?.width || !naturalSize?.height) {
      return { offsetXRatio: 0, offsetYRatio: 0, widthRatio: 1, heightRatio: 1 };
    }
    const containerRatio = cw / ch;
    const imageRatio = naturalSize.width / naturalSize.height;
    let widthRatio, heightRatio;
    if (imageRatio > containerRatio) {
      widthRatio = 1;
      heightRatio = containerRatio / imageRatio;
    } else {
      heightRatio = 1;
      widthRatio = imageRatio / containerRatio;
    }
    return { offsetXRatio: (1 - widthRatio) / 2, offsetYRatio: (1 - heightRatio) / 2, widthRatio, heightRatio };
  };

  // getBoundingClientRect() 하나에서만 rect.left/width를 같이 뽑아써서(=같은 배율끼리만 나눗셈)
  // "컨테이너 안에서의 비율"부터 구한 뒤, 그 비율을 다시 "이미지 영역 안에서의 비율"로 환산함.
  // 0~100으로 자르지 않은 원본값을 반환 - 그룹 드래그 중 델타(이동량) 계산은 커서가 잠깐 도면
  // 경계를 살짝 벗어나도 끊기면 안 되므로, 클램프는 각 용도(배치 확정/그룹 이동 적용)에서 따로 함
  const clientPointToImagePctUnclamped = (clientX, clientY) => {
    if (!mapRef.current) return null;
    const rect = mapRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const containerFracX = (clientX - rect.left) / rect.width;
    const containerFracY = (clientY - rect.top) / rect.height;
    const { offsetXRatio, offsetYRatio, widthRatio, heightRatio } = getImageBoxRatio();
    if (!widthRatio || !heightRatio) return null;
    const xPct = ((containerFracX - offsetXRatio) / widthRatio) * 100;
    const yPct = ((containerFracY - offsetYRatio) / heightRatio) * 100;
    return { xPct, yPct };
  };

  // 도면 컨테이너 자체 밖으로 나가면 배치 취소 판단이 필요한 단일 배치/재배치용 - 컨테이너
  // 경계 밖이면 null, 안이면 0~100으로 클램프해서 반환
  const clientPointToImagePct = (clientX, clientY) => {
    if (!mapRef.current) return null;
    const rect = mapRef.current.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
    const pct = clientPointToImagePctUnclamped(clientX, clientY);
    if (!pct) return null;
    return { xPct: Math.min(100, Math.max(0, pct.xPct)), yPct: Math.min(100, Math.max(0, pct.yPct)) };
  };

  // 설비 칩/마커를 누르기 시작했을 때 - 이후 포인터 이동은 window 리스너(아래 useEffect)가 처리
  const handleEquipPointerDown = (equipId) => (e) => {
    if (!isEditMode) return;
    e.preventDefault();
    dragEquipIdRef.current = equipId;
    setDragEquipId(equipId);
    setDragPreviewPct(clientPointToImagePct(e.clientX, e.clientY));
  };

  // 드래그 도중(누른 뒤에) ctrl/cmd를 눌러도, 미리 누르고 클릭한 것과 똑같이 취급되도록
  // - 이동은 취소(원래 위치 유지)하고, 지금 누르고 있던 설비를 다중 선택 목록에 추가함
  const cancelDragIntoSelection = () => {
    const equipId = dragEquipIdRef.current;
    dragEquipIdRef.current = null;
    setDragEquipId(null);
    setDragPreviewPct(null);
    if (equipId) {
      setMultiSelectedIds(prev => (prev.includes(equipId) ? prev : [...prev, equipId]));
    }
  };

  useEffect(() => {
    if (!dragEquipId) return undefined;
    const handleMove = (e) => {
      if (e.ctrlKey || e.metaKey) {
        cancelDragIntoSelection();
        return;
      }
      setDragPreviewPct(clientPointToImagePct(e.clientX, e.clientY));
    };
    const handleUp = (e) => {
      if (e.ctrlKey || e.metaKey) {
        cancelDragIntoSelection();
        return;
      }
      const equipId = dragEquipIdRef.current;
      dragEquipIdRef.current = null;
      setDragEquipId(null);
      const pct = clientPointToImagePct(e.clientX, e.clientY);
      setDragPreviewPct(null);
      if (!equipId || !pct) return; // 도면 밖에서 손을 떼면 배치 취소 (기존 마커면 원래 자리 유지)
      setPositions(prev => {
        const next = { ...prev, [equipId]: pct };
        savePositions(next);
        return next;
      });
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragEquipId]);

  // 다중 선택된 설비들을 통째로 옮기는 그룹 드래그 - 시작 시점 각자의 위치를 스냅샷해두고,
  // 그 이후로는 "시작점 대비 커서가 얼마나 움직였는지(델타)"만 계산해서 전부에 똑같이 더함
  useEffect(() => {
    if (!isGroupDragging) return undefined;
    const handleMove = (e) => {
      const drag = groupDragRef.current;
      if (!drag) return;
      const curPct = clientPointToImagePctUnclamped(e.clientX, e.clientY);
      if (!curPct) return;
      const dx = curPct.xPct - drag.startPct.xPct;
      const dy = curPct.yPct - drag.startPct.yPct;
      const next = {};
      Object.entries(drag.startPositions).forEach(([id, pos]) => {
        next[id] = {
          xPct: Math.min(100, Math.max(0, pos.xPct + dx)),
          yPct: Math.min(100, Math.max(0, pos.yPct + dy)),
        };
      });
      setGroupDragPreview(next);
    };
    const handleUp = (e) => {
      const drag = groupDragRef.current;
      groupDragRef.current = null;
      setIsGroupDragging(false);
      setGroupDragPreview(null);
      if (!drag) return;
      const curPct = clientPointToImagePctUnclamped(e.clientX, e.clientY);
      if (!curPct) return; // 계산이 안 되는 상황이면 원위치 유지
      const dx = curPct.xPct - drag.startPct.xPct;
      const dy = curPct.yPct - drag.startPct.yPct;
      setPositions(prev => {
        const next = { ...prev };
        Object.entries(drag.startPositions).forEach(([id, pos]) => {
          next[id] = {
            xPct: Math.min(100, Math.max(0, pos.xPct + dx)),
            yPct: Math.min(100, Math.max(0, pos.yPct + dy)),
          };
        });
        savePositions(next);
        return next;
      });
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGroupDragging]);

  // 설비 목록 초기 조회(REST) + 실시간 상태 갱신(WebSocket) - RealtimeScreen.jsx와 동일한 패턴이지만
  // 이 화면은 마커 색만 필요해서 알람/로그 재조회, IndexedDB 저장 같은 부가 로직은 뺀 축소판
  useEffect(() => {
    let isMounted = true;
    const headers = user?.token ? { Authorization: `Bearer ${user.token}` } : {};

    const fetchEquipments = async () => {
      const [tempRes, elecRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/live/monitoring/temp`, { headers })
          .catch(err => { console.error('요청 실패 (temp):', err); return { data: [] }; }),
        axios.get(`${API_BASE_URL}/api/live/monitoring/elec`, { headers })
          .catch(err => { console.error('요청 실패 (elec):', err); return { data: [] }; }),
      ]);
      if (!isMounted) return;
      setEquipments(mergeEquipmentLists(tempRes.data || [], elecRes.data || []));
    };
    fetchEquipments();

    const client = new Client({
      brokerURL: `${WS_BASE_URL}/ws/websocket`,
      connectHeaders: {
        Authorization: user?.token ? `Bearer ${user.token}` : '',
        token: user?.token || '',
      },
      reconnectDelay: 5000,
      onConnect: () => {
        if (!isMounted) return;
        const handleLiveMessage = (domain) => async (message) => {
          if (!isMounted) return;
          try {
            const parsed = JSON.parse(message.body);
            const list = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.data) ? parsed.data : [parsed]);
            if (list.length === 0) return;
            const mergeDto = domain === 'temp' ? mergeTempDto : mergeElecDto;
            setEquipments(prev => {
              const updated = [...prev];
              list.forEach(dto => {
                const idx = updated.findIndex(eq => eq.equipId === dto.equipId);
                if (idx >= 0) {
                  updated[idx] = mergeDto(updated[idx], dto);
                } else {
                  updated.push(mergeDto({ ...EMPTY_EQUIP_ROW }, dto));
                }
              });
              return updated;
            });
            // 마커 클릭 시 뜨는 EquipmentHistoryModal이 IndexedDB(liveData)에서 추이를 읽어오므로,
            // RealtimeScreen과 동일하게 여기서도 저장해둬야 이 화면만 열었을 때도 데이터가 보임
            await saveToDB(list);
          } catch (e) {
            console.error('웹소켓 데이터 파싱 에러:', e);
          }
        };
        client.subscribe('/topic/live/monitoring/temp', handleLiveMessage('temp'));
        client.subscribe('/topic/live/monitoring/elec', handleLiveMessage('elec'));
      },
      onStompError: (frame) => console.error('STOMP 에러:', frame.headers['message']),
    });
    client.activate();

    return () => {
      isMounted = false;
      client.deactivate();
    };
  }, [user?.token]);

  const handleImageButtonClick = () => fileInputRef.current?.click();

  // 파일 선택창(input)과 드래그&드롭(onDrop) 둘 다 여기로 모아서 처리
  const processImageFile = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setAlertMessage('이미지 파일만 업로드할 수 있습니다.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setAlertMessage('이미지 용량이 너무 큽니다. 3MB 이하 이미지를 사용해주세요.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      try {
        localStorage.setItem(IMAGE_KEY, dataUrl);
        setImage(dataUrl);
      } catch {
        setAlertMessage('이미지를 저장하지 못했습니다. 더 작은 이미지를 사용해주세요.');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    processImageFile(file);
  };

  // 도면 영역에 파일을 드롭했을 때(탐색기에서 끌어온 이미지) - 설비 배치는 포인터 이벤트
  // (handleEquipPointerDown + 위 useEffect)로 별도 처리하므로 여기선 이미지 교체만 다룸
  const handleDropOnMap = (e) => {
    e.preventDefault();
    resetFileDragState();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processImageFile(e.dataTransfer.files[0]);
    }
  };

  const handleDropOnEmptyState = (e) => {
    e.preventDefault();
    resetFileDragState();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processImageFile(e.dataTransfer.files[0]);
    }
  };

  const handleResetPositions = () => {
    setIsResetConfirmOpen(false);
    setPositions({});
    savePositions({});
    setMultiSelectedIds([]);
  };

  // 기준 설비(refEquipId)의 좌표에 targetIds의 해당 축(axis: 'xPct' | 'yPct')을 맞춤
  const alignTo = (refEquipId, axis, targetIds) => {
    const refPos = positions[refEquipId];
    if (!refPos || targetIds.length === 0) return;
    setPositions(prev => {
      const next = { ...prev };
      targetIds.forEach(id => {
        if (next[id]) next[id] = { ...next[id], [axis]: refPos[axis] };
      });
      savePositions(next);
      return next;
    });
  };

  // Ctrl(맥은 Cmd)+클릭: 다중 선택 목록에 넣고 뺌. Shift+클릭: 지금까지 선택해둔 설비들을
  // 이 설비의 가로줄(Y)에 맞춰 정렬하고, 이 설비도 선택 목록에 추가함(연속으로 계속 맞출 수 있게)
  const handleMarkerPointerDown = (equipId) => (e) => {
    if (!isEditMode) return;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setMultiSelectedIds(prev => (
        prev.includes(equipId) ? prev.filter(id => id !== equipId) : [...prev, equipId]
      ));
      return;
    }
    if (e.shiftKey) {
      e.preventDefault();
      if (multiSelectedIds.length > 0) alignTo(equipId, 'yPct', multiSelectedIds);
      setMultiSelectedIds(prev => (prev.includes(equipId) ? prev : [...prev, equipId]));
      return;
    }
    // 일반 클릭(수식키 없음)인데 지금 다중 선택돼 있는 것 중 하나를 눌렀다면 선택된 것들을
    // 통째로 같이 옮김(그룹 드래그). 선택 안 된 걸 누르면 기존처럼 그 하나만 드래그하고 선택 해제
    if (multiSelectedIds.length > 1 && multiSelectedIds.includes(equipId)) {
      e.preventDefault();
      const startPct = clientPointToImagePctUnclamped(e.clientX, e.clientY);
      if (!startPct) return;
      const startPositions = {};
      multiSelectedIds.forEach(id => { if (positions[id]) startPositions[id] = positions[id]; });
      groupDragRef.current = { startPct, startPositions };
      setGroupDragPreview(startPositions);
      setIsGroupDragging(true);
      return;
    }
    setMultiSelectedIds([]);
    handleEquipPointerDown(equipId)(e);
  };

  const placedIds = new Set(Object.keys(positions));
  const placedEquipments = equipments.filter(eq => placedIds.has(eq.equipId));
  const unplacedEquipments = equipments.filter(eq => !placedIds.has(eq.equipId));

  const selectedEquip = equipments.find(eq => eq.equipId === selectedEquipId);

  return (
    <div className={`w-full min-w-[320px] flex flex-col transition-colors h-[calc(100vh/1.1)] max-h-[calc(1080px/1.1)] overflow-hidden ${
      isDarkMode ? 'bg-[#0A0E1A]' : 'bg-gray-50'
    }`}>
      <Header
        user={user}
        route={route}
        setRoute={setRoute}
        openMyPage={openMyPage}
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
        isAlarmOn={isAlarmOn}
        setIsAlarmOn={setIsAlarmOn}
      />

      <div className="flex-1 min-h-0 p-4 lg:p-6 flex flex-col gap-3">
        {/* 상단 툴바: 온도/전력 토글 + 배치 편집 모드 + 이미지 업로드 */}
        <div className="flex items-center gap-3 flex-wrap shrink-0">
          <div className={`flex items-center p-0.5 rounded-full border shrink-0 transition-colors ${
            isDarkMode ? 'bg-[#0D1224] border-[#232B45]' : 'bg-gray-100 border-gray-200'
          }`}>
            {[['temperature', '온도'], ['power', '전력']].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setMetricTab(value)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide transition-colors ${
                  metricTab === value
                    ? (isDarkMode ? 'bg-[#1E2A4A] text-[#22D3EE] border border-[#22D3EE]/40' : 'bg-white text-green-700 border border-gray-300 shadow-sm')
                    : (isDarkMode ? 'text-[#7D87A8] hover:text-[#B9C2DE] border border-transparent' : 'text-gray-500 hover:text-gray-800 border border-transparent')
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2">
            {isEditMode && (
              <>
                <button
                  type="button"
                  onClick={handleImageButtonClick}
                  title="도면 위에 이미지 파일을 끌어다 놓아도 교체됩니다"
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors border ${
                    isDarkMode
                      ? 'border-[#232B45] hover:border-[#2A335A] hover:bg-[#151B30] text-[#9FACC9] hover:text-[#EDF1FC]'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-100 text-gray-600 hover:text-gray-900'
                  }`}
                >
                  배치도 이미지 업로드
                </button>
                {Object.keys(positions).length > 0 && (
                  <button
                    type="button"
                    onClick={() => setIsResetConfirmOpen(true)}
                    title="배치된 설비 마커를 전부 지우고 다시 배치합니다"
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors border ${
                      isDarkMode
                        ? 'border-[#232B45] hover:border-red-500/40 hover:bg-[#151B30] text-[#9FACC9] hover:text-[#FB5D75]'
                        : 'border-gray-200 hover:border-red-300 hover:bg-red-50 text-gray-600 hover:text-red-600'
                    }`}
                  >
                    배치 초기화
                  </button>
                )}
              </>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageChange} className="hidden" />

            <button
              type="button"
              onClick={() => { setIsEditMode(v => !v); setMultiSelectedIds([]); }}
              title={isEditMode ? '배치 편집 완료' : '설비 배치 편집'}
              className={`shrink-0 p-1.5 rounded-lg transition-colors ${
                isEditMode
                  ? (isDarkMode ? 'bg-[#22D3EE]/20 text-[#22D3EE]' : 'bg-green-100 text-green-700')
                  : (isDarkMode ? 'text-[#5C6584] hover:text-[#EDF1FC] hover:bg-[#1A2036]' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100')
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        </div>

        {/* 배치 편집 모드: 아직 배치 안 된 설비를 칩으로 나열 - 드래그해서 도면 위로 옮기면 배치됨 */}
        {isEditMode && (
          <div className={`shrink-0 rounded-xl border p-3 ${
            isDarkMode ? 'bg-[#12172A] border-[#1E253D]' : 'bg-white border-gray-200 shadow-sm'
          }`}>
            <p className={`text-[11px] font-semibold mb-2 ${isDarkMode ? 'text-[#9FACC9]' : 'text-gray-500'}`}>
              배치되지 않은 설비 ({unplacedEquipments.length}) - 도면 위로 드래그해서 배치하세요
            </p>
            {unplacedEquipments.length === 0 ? (
              <p className={`text-[11px] ${isDarkMode ? 'text-[#5C6584]' : 'text-gray-400'}`}>모든 설비가 배치되었습니다.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {unplacedEquipments.map(eq => (
                  <div
                    key={eq.equipId}
                    onPointerDown={handleEquipPointerDown(eq.equipId)}
                    title="눌러서 도면 위로 끌어다 놓으세요"
                    style={{ touchAction: 'none' }}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border cursor-move select-none ${
                      dragEquipId === eq.equipId ? 'opacity-40' : ''
                    } ${isDarkMode ? 'bg-[#1A2036] border-[#232B45] text-[#B9C2DE]' : 'bg-gray-100 border-gray-200 text-gray-700'}`}
                  >
                    {eq.equipName}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 다중 선택(ctrl+클릭) 상태 - 정렬은 shift+클릭으로, 이동은 선택된 걸 그냥 드래그해서 함 */}
        {isEditMode && multiSelectedIds.length > 0 && (
          <div className={`shrink-0 flex items-center gap-2 rounded-xl border px-3 py-2 ${
            isDarkMode ? 'bg-[#12172A] border-[#1E253D]' : 'bg-white border-gray-200 shadow-sm'
          }`}>
            <span className={`text-[11px] font-semibold ${isDarkMode ? 'text-[#9FACC9]' : 'text-gray-500'}`}>
              {multiSelectedIds.length}개 선택됨 - 선택된 걸 그냥 드래그하면 다같이 이동, shift+클릭으로 바로 가로 정렬
            </span>
            <button
              type="button"
              onClick={() => setMultiSelectedIds([])}
              className={`ml-auto text-[11px] font-semibold ${isDarkMode ? 'text-[#5C6584] hover:text-[#EDF1FC]' : 'text-gray-400 hover:text-gray-700'}`}
            >
              선택 해제
            </button>
          </div>
        )}

        {/* 도면 영역 */}
        <div className={`relative flex-1 min-h-0 rounded-xl border overflow-hidden ${
          isDarkMode ? 'bg-[#12172A] border-[#1E253D]' : 'bg-white border-gray-200 shadow-sm'
        }`}>
          {!image ? (
            <div
              onDragEnter={handleDragEnterZone}
              onDragLeave={handleDragLeaveZone}
              onDragOver={(e) => { if (isEditMode) e.preventDefault(); }}
              onDrop={isEditMode ? handleDropOnEmptyState : undefined}
              className={`h-full flex flex-col items-center justify-center gap-3 text-sm border-2 border-dashed rounded-lg m-1 transition-colors ${
                isFileDragOver
                  ? (isDarkMode ? 'border-[#22D3EE] bg-[#22D3EE]/5' : 'border-green-500 bg-green-50')
                  : 'border-transparent'
              } ${isDarkMode ? 'text-[#5C6584]' : 'text-gray-400'}`}
            >
              <span>배치도 이미지가 아직 없습니다.</span>
              {isEditMode ? (
                <>
                  <button
                    type="button"
                    onClick={handleImageButtonClick}
                    className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors ${
                      isDarkMode ? 'bg-[#1A2036] hover:bg-[#232B45] text-[#B9C2DE]' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                    }`}
                  >
                    이미지 업로드
                  </button>
                  <span className="text-[11px]">
                    {isFileDragOver ? '여기에 놓으세요' : '또는 이미지 파일을 이 영역으로 끌어다 놓으세요'}
                  </span>
                </>
              ) : (
                <span>편집 모드에서 업로드할 수 있습니다.</span>
              )}
            </div>
          ) : (
            <div
              ref={mapRef}
              onDragEnter={handleDragEnterZone}
              onDragLeave={handleDragLeaveZone}
              onDragOver={(e) => { if (isEditMode) e.preventDefault(); }}
              onDrop={isEditMode ? handleDropOnMap : undefined}
              className={`relative w-full h-full transition-shadow ${
                dragEquipId && dragPreviewPct ? (isDarkMode ? 'ring-2 ring-inset ring-[#22D3EE]' : 'ring-2 ring-inset ring-green-500') : ''
              }`}
            >
              <img
                src={image}
                alt="설비 배치도"
                draggable={false}
                onLoad={(e) => setNaturalSize({ width: e.target.naturalWidth, height: e.target.naturalHeight })}
                className="w-full h-full object-contain select-none pointer-events-none"
              />
              {isFileDragOver && (
                <div className={`absolute inset-0 z-10 flex items-center justify-center pointer-events-none border-2 border-dashed ${
                  isDarkMode ? 'border-[#22D3EE] bg-[#0A0E1A]/70' : 'border-green-500 bg-white/70'
                }`}>
                  <span className={`text-sm font-semibold ${isDarkMode ? 'text-[#22D3EE]' : 'text-green-700'}`}>
                    여기에 놓으면 배치도 이미지가 교체됩니다
                  </span>
                </div>
              )}
              {(() => {
                // % 좌표 -> "컨테이너 기준 %"로 환산해서 style에 그대로 CSS %로 씀(px로 직접
                // 계산하지 않음). CSS %는 브라우저가 실제 렌더링 시점의 진짜 크기를 기준으로
                // 알아서 계산해주므로, zoom이 몇 %든 JS가 px를 잘못 계산할 여지 자체가 없어짐
                const { offsetXRatio, offsetYRatio, widthRatio, heightRatio } = getImageBoxRatio();
                const toContainerPct = (pos) => ({
                  leftPct: (offsetXRatio + (pos.xPct / 100) * widthRatio) * 100,
                  topPct: (offsetYRatio + (pos.yPct / 100) * heightRatio) * 100,
                });

                const markers = placedEquipments.map(eq => {
                  const pos = (isGroupDragging && groupDragPreview?.[eq.equipId]) || positions[eq.equipId];
                  if (!pos) return null;
                  const statusValue = metricTab === 'temperature' ? eq.status : eq.powerStatus;
                  const meta = getStatusMeta(statusValue);
                  const { leftPct, topPct } = toContainerPct(pos);
                  const isSelected = multiSelectedIds.includes(eq.equipId);
                  return (
                    <div
                      key={eq.equipId}
                      onPointerDown={handleMarkerPointerDown(eq.equipId)}
                      onClick={() => { if (!isEditMode) setSelectedEquipId(eq.equipId); }}
                      title={isEditMode ? `${eq.equipName} (ctrl+클릭: 다중 선택 / shift+클릭: 선택한 것들을 이 설비 가로줄에 맞춤 / 선택된 걸 그냥 드래그: 다같이 이동)` : eq.equipName}
                      style={{ left: `${leftPct}%`, top: `${topPct}%`, touchAction: isEditMode ? 'none' : undefined }}
                      className={`absolute flex flex-col items-center gap-1 -translate-x-1/2 -translate-y-1/2 ${isEditMode ? 'cursor-move' : 'cursor-pointer'} ${
                        dragEquipId === eq.equipId ? 'opacity-0' : ''
                      }`}
                    >
                      <span className={`w-3.5 h-3.5 rounded-full border-2 shadow ${STATUS_DOT_CLASS[meta.color]} ${meta.color === 'red' ? 'animate-pulse' : ''} ${
                        isSelected ? (isDarkMode ? 'border-[#22D3EE]' : 'border-green-600') : 'border-white'
                      }`} style={isSelected ? { boxShadow: `0 0 0 2px ${isDarkMode ? '#22D3EE' : '#16A34A'}` } : undefined} />
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-black/60 text-white whitespace-nowrap">
                        {eq.equipName}
                      </span>
                    </div>
                  );
                });

                // 드래그 중 실시간 미리보기도 같은 방식(CSS %)으로 그려서 실제 배치 위치와 항상
                // 픽셀 단위로 정확히 일치하게 함
                if (dragEquipId && dragPreviewPct) {
                  const dragEquip = equipments.find(eq => eq.equipId === dragEquipId);
                  const statusValue = metricTab === 'temperature' ? dragEquip?.status : dragEquip?.powerStatus;
                  const meta = getStatusMeta(statusValue);
                  const { leftPct, topPct } = toContainerPct(dragPreviewPct);
                  markers.push(
                    <div
                      key="__drag-preview__"
                      className="absolute flex flex-col items-center gap-1 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                      style={{ left: `${leftPct}%`, top: `${topPct}%` }}
                    >
                      <span className={`w-4 h-4 rounded-full border-2 border-white shadow-lg ${STATUS_DOT_CLASS[meta.color]}`} />
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-black/70 text-white whitespace-nowrap">
                        {dragEquip?.equipName}
                      </span>
                    </div>
                  );
                }

                return markers;
              })()}
            </div>
          )}

          {/* 맵 높이에 영향 안 주도록 flex 흐름 밖(overlay)에 배지로 표시 - 이 문구가 나타나고
              사라질 때마다 아래 flex 레이아웃이 다시 계산되면서 도면 이미지가 커졌다 작아졌다
              하는 것처럼 보였음 */}
          {!isEditMode && image && unplacedEquipments.length > 0 && (
            <p className={`absolute bottom-2 left-2 text-[11px] px-2 py-1 rounded-lg backdrop-blur-sm ${
              isDarkMode ? 'bg-[#0A0E1A]/70 text-[#9FACC9]' : 'bg-white/80 text-gray-500'
            }`}>
              배치되지 않은 설비 {unplacedEquipments.length}개 (편집 모드에서 배치할 수 있습니다)
            </p>
          )}
        </div>
      </div>

      <CustomAlert message={alertMessage} onClose={() => setAlertMessage('')} isDarkMode={isDarkMode} />
      <CustomConfirm
        message={isResetConfirmOpen ? '배치된 설비 마커를 모두 지우시겠습니까?' : ''}
        onConfirm={handleResetPositions}
        onCancel={() => setIsResetConfirmOpen(false)}
        isDarkMode={isDarkMode}
      />

      {selectedEquipId && selectedEquip && (
        <EquipmentHistoryModal
          equipId={selectedEquipId}
          equipName={selectedEquip.equipName}
          threshold={selectedEquip.threshold}
          powerThreshold={selectedEquip.powerThreshold}
          focusMetric={metricTab}
          onClose={() => setSelectedEquipId(null)}
          isDarkMode={isDarkMode}
          token={user?.token}
        />
      )}
    </div>
  );
};

export default PlantMapScreen;
