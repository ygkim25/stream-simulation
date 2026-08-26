import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Client } from '@stomp/stompjs';
import Header from '../components/Header';
import CustomAlert from '../components/CustomAlert';
import CustomConfirm from '../components/CustomConfirm';
import EquipmentHistoryModal from '../components/EquipmentHistoryModal';
import EquipmentCompareModal from '../components/EquipmentCompareModal';
import { getStatusMeta, STATUS_DOT_CLASS, DEFAULT_STATUS_INFO_LINES } from '../utils/statusStyles';
import { API_BASE_URL, WS_BASE_URL } from '../utils/apiConfig';
import { EMPTY_EQUIP_ROW, mergeTempDto, mergeElecDto, mergeEquipmentLists } from '../utils/equipmentMerge';
import { saveToDB } from '../utils/indexedDb';
import { useClickOutside } from '../utils/useClickOutside';

// 배치도 이미지/좌표는 백엔드 없이 이 브라우저에만 저장함 (카드 순서 저장과 동일한 패턴) -
// 다른 기기/사용자와는 공유되지 않지만, 여러 사용자가 같은 배치도를 봐야 하는 시점이 오면 그때
// 백엔드 테이블로 옮기면 됨
const IMAGE_KEY = 'plantMapImage';
const POSITIONS_KEY = 'plantMapPositions';
const ZONES_KEY = 'plantMapZones';
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

// 구역(zone) - 도면 위에 그려두는 이름 붙은 사각형. 설비 좌표와 동일하게 "이미지 기준 %"로
// 저장해서(xPct/yPct/widthPct/heightPct) zoom·리사이즈에 안전하게 씀
const loadStoredZones = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(ZONES_KEY));
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
};
const saveZones = (zones) => {
  try { localStorage.setItem(ZONES_KEY, JSON.stringify(zones)); } catch {
    // localStorage를 못 쓰는 환경이면 이번 세션 동안만(메모리) 구역이 유지됨
  }
};
// 구역 안 설비 중 제일 안 좋은 상태로 구역 색을 정함 (위험 > 경고 > 정상)
const STATUS_COLOR_PRIORITY = { red: 2, amber: 1, green: 0 };
const ZONE_BORDER_CLASS = {
  green: { dark: 'border-[#34D399]', light: 'border-green-500' },
  amber: { dark: 'border-[#FBBF24]', light: 'border-amber-500' },
  red: { dark: 'border-[#FB5D75]', light: 'border-red-500' },
};

const PlantMapScreen = ({ user, route, setRoute, openMyPage, isDarkMode, setIsDarkMode, isAlarmOn, setIsAlarmOn }) => {
  const [equipments, setEquipments] = useState([]);
  const [image, setImage] = useState(() => loadStoredImage());
  const [positions, setPositions] = useState(() => loadStoredPositions());
  const [isEditMode, setIsEditMode] = useState(false);
  const [metricTab, setMetricTab] = useState('temperature');
  const [selectedEquipId, setSelectedEquipId] = useState(null);
  const [alertMessage, setAlertMessage] = useState('');
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [isCompareOpen, setIsCompareOpen] = useState(false);
  // 배치되지 않은 설비 트레이 - 도면 이미지 위 오버레이라 열고 닫아도 도면 크기엔 영향 없음
  const [isTrayOpen, setIsTrayOpen] = useState(true);
  const [isFileDragOver, setIsFileDragOver] = useState(false);
  // "설비 배치도" 옆 정보 아이콘 - 누르면 정상/경고/위험 판정 기준을 보여주는 팝오버
  // (AlarmSidebar와 동일한 UX, 같은 utils/statusStyles.js 기본값을 그대로 씀)
  const infoRef = useRef(null);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  useClickOutside(infoRef, () => setIsInfoOpen(false), isInfoOpen);
  // 이 화면 자체(클릭/드래그/구역/비교 등)의 사용법 안내 모달 - 항목이 많아서 작은 팝오버 대신 모달로
  const [isHelpOpen, setIsHelpOpen] = useState(false);
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
  // 마커를 눌렀는지(origin='marker') 미배치 칩을 눌렀는지(origin='chip') + 누른 시작 지점.
  // 손을 뗄 때 시작 지점과 거의 안 움직였으면(=드래그가 아니라 그냥 클릭) "이동"이 아니라
  // "선택"으로 취급해서 Delete로 배치 해제할 수 있게 함 (칩은 애초에 위치가 없어 선택 대상 아님)
  const dragOriginRef = useRef('chip');
  const pointerDownPosRef = useRef({ x: 0, y: 0 });
  const CLICK_MOVE_THRESHOLD = 4;
  // 다중 선택된 것 중 하나를 그냥(수식키 없이) 누르면 선택된 것들을 통째로 같이 옮김 - 서로
  // 간의 상대 위치(간격)는 그대로 유지한 채 델타(이동량)만 전부에 똑같이 적용
  const [isGroupDragging, setIsGroupDragging] = useState(false);
  const [groupDragPreview, setGroupDragPreview] = useState(null); // { [equipId]: {xPct, yPct} } | null
  const groupDragRef = useRef(null); // { startPct, startPositions } - 이벤트 핸들러 전용, 렌더링에선 안 씀

  // 구역(zone) - 사각형 이동/크기조절도 위 마커 드래그와 같은 패턴(포인터 이벤트 + %기반 델타)
  const [zones, setZones] = useState(() => loadStoredZones());
  const [isZoneDragging, setIsZoneDragging] = useState(false);
  const [zoneDragPreview, setZoneDragPreview] = useState(null); // 드래그 중인 구역 1개의 실시간 {xPct,yPct,widthPct,heightPct}
  const zoneDragRef = useRef(null); // { id, mode: 'move'|'resize', startPct, startZone }
  const [renamingZoneId, setRenamingZoneId] = useState(null);
  const [renameDraft, setRenameDraft] = useState('');
  // 보기 모드에서 구역을 클릭하면 그 안의 설비 목록을 보여주는 팝오버 (한 번에 하나만 열림)
  const [openZoneId, setOpenZoneId] = useState(null);
  const zonePopoverRef = useRef(null);
  useClickOutside(zonePopoverRef, () => setOpenZoneId(null), openZoneId !== null);

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
  const handleEquipPointerDown = (equipId, origin = 'chip') => (e) => {
    if (!isEditMode) return;
    e.preventDefault();
    dragEquipIdRef.current = equipId;
    dragOriginRef.current = origin;
    pointerDownPosRef.current = { x: e.clientX, y: e.clientY };
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
      const origin = dragOriginRef.current;
      const startPos = pointerDownPosRef.current;
      dragEquipIdRef.current = null;
      setDragEquipId(null);
      const pct = clientPointToImagePct(e.clientX, e.clientY);
      setDragPreviewPct(null);
      if (!equipId) return;

      // 거의 안 움직이고 뗐으면(=드래그가 아니라 그냥 클릭) 위치는 그대로 두고 그 마커 하나만
      // 선택함 - 이 상태에서 Delete를 누르면 배치가 해제되도록(아래 keydown 리스너) 함
      const movedDist = Math.hypot(e.clientX - startPos.x, e.clientY - startPos.y);
      if (movedDist < CLICK_MOVE_THRESHOLD && origin === 'marker') {
        setMultiSelectedIds([equipId]);
        return;
      }

      if (!pct) return; // 도면 밖에서 손을 떼면 배치 취소 (기존 마커면 원래 자리 유지)
      setPositions(prev => {
        const next = { ...prev, [equipId]: pct };
        savePositions(next);
        return next;
      });
      if (origin === 'marker') setMultiSelectedIds([]); // 실제로 옮긴 거면 선택은 해제
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

  // 구역 이동/크기조절 시작 지점 대비 델타를 계산해서 시작 시점 스냅샷에 더함 (마커 그룹
  // 드래그와 동일 패턴). 이동은 구역이 도면 밖으로 안 나가게, 크기조절은 최소 5%는 유지되게 클램프
  const applyZoneDrag = (drag, curPct) => {
    const dx = curPct.xPct - drag.startPct.xPct;
    const dy = curPct.yPct - drag.startPct.yPct;
    if (drag.mode === 'resize') {
      const widthPct = Math.min(100 - drag.startZone.xPct, Math.max(5, drag.startZone.widthPct + dx));
      const heightPct = Math.min(100 - drag.startZone.yPct, Math.max(5, drag.startZone.heightPct + dy));
      return { ...drag.startZone, widthPct, heightPct };
    }
    const xPct = Math.min(100 - drag.startZone.widthPct, Math.max(0, drag.startZone.xPct + dx));
    const yPct = Math.min(100 - drag.startZone.heightPct, Math.max(0, drag.startZone.yPct + dy));
    return { ...drag.startZone, xPct, yPct };
  };

  useEffect(() => {
    if (!isZoneDragging) return undefined;
    const handleMove = (e) => {
      const drag = zoneDragRef.current;
      if (!drag) return;
      const curPct = clientPointToImagePctUnclamped(e.clientX, e.clientY);
      if (!curPct) return;
      setZoneDragPreview(applyZoneDrag(drag, curPct));
    };
    const handleUp = (e) => {
      const drag = zoneDragRef.current;
      zoneDragRef.current = null;
      setIsZoneDragging(false);
      setZoneDragPreview(null);
      if (!drag) return;
      const curPct = clientPointToImagePctUnclamped(e.clientX, e.clientY);
      if (!curPct) return;
      const updated = applyZoneDrag(drag, curPct);
      setZones(prev => {
        const next = prev.map(z => (z.id === drag.id ? { ...z, ...updated } : z));
        saveZones(next);
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
  }, [isZoneDragging]);

  const handleZonePointerDown = (zoneId, mode) => (e) => {
    if (!isEditMode) return;
    e.preventDefault();
    e.stopPropagation(); // 도면 배경/설비 배치 핸들러로 안 새게 막음
    const zone = zones.find(z => z.id === zoneId);
    const startPct = clientPointToImagePctUnclamped(e.clientX, e.clientY);
    if (!zone || !startPct) return;
    zoneDragRef.current = { id: zoneId, mode, startPct, startZone: { ...zone } };
    setZoneDragPreview({ ...zone });
    setIsZoneDragging(true);
  };

  const handleAddZone = () => {
    const id = `zone-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setZones(prev => {
      const next = [...prev, { id, name: `구역 ${prev.length + 1}`, xPct: 30, yPct: 30, widthPct: 25, heightPct: 25 }];
      saveZones(next);
      return next;
    });
  };

  const handleDeleteZone = (zoneId) => {
    setZones(prev => {
      const next = prev.filter(z => z.id !== zoneId);
      saveZones(next);
      return next;
    });
    if (renamingZoneId === zoneId) setRenamingZoneId(null);
    if (openZoneId === zoneId) setOpenZoneId(null);
  };

  const startRenameZone = (zone) => {
    setRenamingZoneId(zone.id);
    setRenameDraft(zone.name);
  };
  const commitRenameZone = () => {
    const name = renameDraft.trim();
    if (name && renamingZoneId) {
      setZones(prev => {
        const next = prev.map(z => (z.id === renamingZoneId ? { ...z, name } : z));
        saveZones(next);
        return next;
      });
    }
    setRenamingZoneId(null);
  };

  // 구역 사각형 범위 안에 좌표가 있는 배치된 설비 목록 (위험 > 경고 > 정상 순으로 정렬)
  const getZoneEquipments = (zone) => placedEquipments
    .filter(eq => {
      const pos = positions[eq.equipId];
      if (!pos) return false;
      return pos.xPct >= zone.xPct && pos.xPct <= zone.xPct + zone.widthPct
        && pos.yPct >= zone.yPct && pos.yPct <= zone.yPct + zone.heightPct;
    })
    .sort((a, b) => {
      const colorOf = (eq) => getStatusMeta(metricTab === 'temperature' ? eq.status : eq.powerStatus).color;
      return STATUS_COLOR_PRIORITY[colorOf(b)] - STATUS_COLOR_PRIORITY[colorOf(a)];
    });

  // 구역 안 설비들 중 제일 안 좋은 상태색 + 정상/경고/위험 개수
  const getZoneSummary = (zoneEquipments) => {
    const counts = { normal: 0, warning: 0, danger: 0 };
    let worst = 'green';
    zoneEquipments.forEach(eq => {
      const color = getStatusMeta(metricTab === 'temperature' ? eq.status : eq.powerStatus).color;
      if (color === 'red') counts.danger += 1;
      else if (color === 'amber') counts.warning += 1;
      else counts.normal += 1;
      if (STATUS_COLOR_PRIORITY[color] > STATUS_COLOR_PRIORITY[worst]) worst = color;
    });
    return { counts, worst };
  };

  // 마커를 클릭(드래그 없이)해서 선택해두고 Delete/Backspace를 누르면 배치를 해제해서
  // "배치되지 않은 설비" 트레이로 돌려보냄
  useEffect(() => {
    if (!isEditMode || multiSelectedIds.length === 0) return undefined;
    const handleKeyDown = (e) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      // 다른 입력창(설정값 수정 등)에 포커스가 가 있을 때는 그 입력 삭제를 방해하지 않음
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      setPositions(prev => {
        const next = { ...prev };
        multiSelectedIds.forEach(id => { delete next[id]; });
        savePositions(next);
        return next;
      });
      setMultiSelectedIds([]);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditMode, multiSelectedIds]);

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

  // 아직 배치 안 된 설비들만 도면 위 아무 데나(10~90% 범위 - 가장자리에 딱 붙어 라벨이
  // 잘리지 않도록) 한 번에 뿌림. 이미 배치된 것들은 건드리지 않음
  const handleRandomPlace = () => {
    const placed = new Set(Object.keys(positions));
    const toPlace = equipments.filter(eq => !placed.has(eq.equipId));
    if (toPlace.length === 0) return;
    setPositions(prev => {
      const next = { ...prev };
      toPlace.forEach(eq => {
        next[eq.equipId] = { xPct: 10 + Math.random() * 80, yPct: 10 + Math.random() * 80 };
      });
      savePositions(next);
      return next;
    });
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

  // Ctrl(맥은 Cmd)+클릭: 다중 선택 목록에 넣고 뺌 - 비교 보기(설비 여러 개 겹쳐보기)에 쓰이므로
  // 편집 모드가 아니어도(보기 모드에서도) 항상 동작함. 정렬/그룹 이동/재배치는 편집 모드 전용
  const handleMarkerPointerDown = (equipId) => (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setMultiSelectedIds(prev => (
        prev.includes(equipId) ? prev.filter(id => id !== equipId) : [...prev, equipId]
      ));
      return;
    }
    if (!isEditMode) return;
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
    // 그냥 클릭/드래그 - 실제로 드래그했는지 그냥 클릭했는지는 손을 뗄 때(handleUp) 이동 거리로
    // 판단함 (그냥 클릭이면 선택, 드래그면 이동 후 선택 해제 - 위 handleUp 참고)
    handleEquipPointerDown(equipId, 'marker')(e);
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

          {/* 정상/경고/위험 판정 기준 안내 (AlarmSidebar의 정보 아이콘과 동일) */}
          <div className="relative shrink-0" ref={infoRef}>
            <button
              type="button"
              onClick={() => setIsInfoOpen(v => !v)}
              title="정상/경고/위험 판정 기준"
              className={`w-4 h-4 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                isDarkMode ? 'text-[#5C6584] hover:text-[#EDF1FC]' : 'text-gray-400 hover:text-gray-700'
              }`}
            >
              <svg className="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="9" strokeWidth="1.75" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M12 11v5" />
                <circle cx="12" cy="8" r="0.9" fill="currentColor" stroke="none" />
              </svg>
            </button>
            {isInfoOpen && (
              <div className={`absolute z-30 top-6 left-0 w-56 rounded-lg border p-3 text-[11px] shadow-lg space-y-1.5 ${
                isDarkMode ? 'bg-[#12172A] border-[#232B45] text-[#B9C2DE]' : 'bg-white border-gray-200 text-gray-600'
              }`}>
                {DEFAULT_STATUS_INFO_LINES.map(line => (
                  <div key={line.label} className="flex items-start gap-1.5">
                    <span className={`status-dot mt-1 shrink-0 ${STATUS_DOT_CLASS[line.color]}`} />
                    <span>
                      <b className={isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-800'}>{line.label}</b> · {line.desc}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 이 화면 사용법 안내 (클릭/드래그/구역/비교 등 - 항목이 많아 모달로 따로 뺌).
              위 정상/경고/위험 아이콘과 같은 스타일(원+선 굵기)로 맞춰서 물음표만 다르게 그림 */}
          <button
            type="button"
            onClick={() => setIsHelpOpen(true)}
            title="사용법 보기"
            className={`w-4 h-4 rounded-full flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
              isDarkMode ? 'text-[#5C6584] hover:text-[#EDF1FC]' : 'text-gray-400 hover:text-gray-700'
            }`}
          >
            <svg className="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9" strokeWidth="1.75" />
              {/* 물음표 획이 "i" 세로선보다 훨씬 굵어 보여서, 원 크기는 그대로 두고 물음표만 살짝 축소 */}
              <g transform="translate(12 11) scale(0.8) translate(-12 -11)">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M9.879 9.879a3 3 0 114.243 0c-.293.293-.612.53-.947.71-.607.328-1.175.786-1.175 1.411V13" />
                <circle cx="12" cy="16" r="0.9" fill="currentColor" stroke="none" />
              </g>
            </svg>
          </button>

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
                {unplacedEquipments.length > 0 && (
                  <button
                    type="button"
                    onClick={handleRandomPlace}
                    title="배치되지 않은 설비들을 도면 위 아무 곳에나 한 번에 뿌립니다"
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors border ${
                      isDarkMode
                        ? 'border-[#232B45] hover:border-[#2A335A] hover:bg-[#151B30] text-[#9FACC9] hover:text-[#EDF1FC]'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-100 text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    랜덤 배치
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleAddZone}
                  title="도면 위에 이름 붙은 구역(사각형)을 추가합니다"
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors border ${
                    isDarkMode
                      ? 'border-[#232B45] hover:border-[#2A335A] hover:bg-[#151B30] text-[#9FACC9] hover:text-[#EDF1FC]'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-100 text-gray-600 hover:text-gray-900'
                  }`}
                >
                  구역 추가
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
              onClick={() => { setIsEditMode(v => !v); setMultiSelectedIds([]); setOpenZoneId(null); }}
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

        {/* 도면 영역 */}
        <div className={`relative flex-1 min-h-0 rounded-xl border overflow-hidden ${
            isDarkMode ? 'bg-[#12172A] border-[#1E253D]' : 'bg-white border-gray-200 shadow-sm'
          }`}>
          {/* 다중 선택(ctrl+클릭) 상태 - flex 흐름에 넣으면 선택/해제될 때마다 이 패널이
              생겼다 없어지면서 도면 영역 높이가 바뀌어 이미지가 커졌다 작아졌다 했음(이전에
              "배치되지 않은 설비 N개" 문구에서 겪은 것과 같은 문제) - 도면 위에 반투명
              오버레이로 띄워서 레이아웃에 영향을 안 주게 함 */}
          {multiSelectedIds.length > 0 && (() => {
            const names = multiSelectedIds
              .map(id => equipments.find(eq => eq.equipId === id)?.equipName)
              .filter(Boolean);
            const nameLabel = names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} 외 ${names.length - 3}개`;
            // 도면 이미지 위에 뜨는 오버레이라 다크모드에서도 라이트 모드와 같은 색으로 고정
            // (앱 테마보다 "이미지 위에 뜨는 라벨"로서 항상 같은 톤이 낫다고 판단)
            return (
              <div className="absolute z-20 top-2 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-lg px-3 py-2 backdrop-blur-sm bg-gray-400/20">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] font-semibold whitespace-nowrap text-gray-800">
                    {nameLabel} 선택됨
                  </span>
                  {isEditMode && (
                    <span className="text-[10px] whitespace-nowrap text-gray-700">
                      드래그: 같이 이동 · Shift+클릭: 가로 정렬 · Delete: 배치 해제
                    </span>
                  )}
                </div>
                {!isEditMode && multiSelectedIds.length >= 2 && (
                  <button
                    type="button"
                    onClick={() => setIsCompareOpen(true)}
                    title="선택한 설비들의 추이를 한 차트에 겹쳐서 봅니다"
                    className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border whitespace-nowrap border-gray-200 hover:bg-gray-100 text-gray-600 hover:text-gray-900"
                  >
                    비교 보기
                  </button>
                )}
              </div>
            );
          })()}

          {/* 배치되지 않은 설비 트레이 - 도면 "위"에 있던 걸(flex 흐름) 이미지 위 오버레이로 옮겨서
              열고 닫아도(isTrayOpen) 도면 크기에 전혀 영향이 없게 함 */}
          {isEditMode && (
            <div className={`absolute z-20 top-2 left-2 max-w-[220px] rounded-lg backdrop-blur-sm ${
              isDarkMode ? 'bg-[#0A0E1A]/70' : 'bg-white/80'
            }`}>
              <button
                type="button"
                onClick={() => setIsTrayOpen(v => !v)}
                className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-[11px] font-semibold ${
                  isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-800'
                }`}
              >
                <span>배치되지 않은 설비 ({unplacedEquipments.length})</span>
                <span className={`transition-transform text-[9px] ${isTrayOpen ? '' : '-rotate-90'}`}>▾</span>
              </button>
              {isTrayOpen && (
                <div className="px-3 pb-3 max-h-56 overflow-y-auto flex flex-col gap-1.5">
                  {unplacedEquipments.length === 0 ? (
                    <p className={`text-[11px] ${isDarkMode ? 'text-[#5C6584]' : 'text-gray-400'}`}>모든 설비가 배치되었습니다.</p>
                  ) : (
                    unplacedEquipments.map(eq => (
                      <div
                        key={eq.equipId}
                        onPointerDown={handleEquipPointerDown(eq.equipId)}
                        title="눌러서 도면 위로 끌어다 놓으세요"
                        style={{ touchAction: 'none' }}
                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border cursor-move select-none whitespace-nowrap ${
                          dragEquipId === eq.equipId ? 'opacity-40' : ''
                        } ${isDarkMode ? 'bg-[#1A2036] border-[#232B45] text-[#B9C2DE]' : 'bg-gray-100 border-gray-200 text-gray-700'}`}
                      >
                        {eq.equipName}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

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
              onPointerDown={(e) => {
                // 마커/구역은 각자 pointerDown에서 stopPropagation 하므로, 여기까지 그대로
                // 올라온다는 건 아무것도 없는 배경(이미지)을 눌렀다는 뜻 - 다중 선택 해제.
                // 별도의 "선택 해제" 버튼을 없앤 대신 이 방식으로 항상(편집/보기 모드 모두) 해제되게 함.
                // click이 아니라 pointerDown에서 처리해야, 드래그를 마친 지점(배경)에서
                // 뒤늦게 뜨는 합성 click 이벤트 때문에 방금 끝낸 그룹 이동의 선택이
                // 곧바로 풀려버리는 걸 막을 수 있음
                if (e.target === e.currentTarget) setMultiSelectedIds([]);
              }}
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
              {/* 구역(zone) - 마커보다 먼저 그려서(DOM 순서상 아래) 마커가 항상 위에서 클릭됨 */}
              {(() => {
                const { offsetXRatio, offsetYRatio, widthRatio, heightRatio } = getImageBoxRatio();
                return zones.map(zone => {
                  const isDraggingThis = isZoneDragging && zoneDragPreview?.id === zone.id;
                  const z = isDraggingThis ? zoneDragPreview : zone;
                  const leftPct = (offsetXRatio + (z.xPct / 100) * widthRatio) * 100;
                  const topPct = (offsetYRatio + (z.yPct / 100) * heightRatio) * 100;
                  const widthPct = (z.widthPct / 100) * widthRatio * 100;
                  const heightPct = (z.heightPct / 100) * heightRatio * 100;
                  const zoneEquipments = getZoneEquipments(zone);
                  const { counts, worst: color } = getZoneSummary(zoneEquipments);
                  const borderClass = ZONE_BORDER_CLASS[color][isDarkMode ? 'dark' : 'light'];
                  const isRenaming = renamingZoneId === zone.id;
                  const isOpen = openZoneId === zone.id;
                  return (
                    <div
                      key={zone.id}
                      onPointerDown={handleZonePointerDown(zone.id, 'move')}
                      onClick={() => { if (!isEditMode) setOpenZoneId(v => (v === zone.id ? null : zone.id)); }}
                      style={{
                        left: `${leftPct}%`, top: `${topPct}%`, width: `${widthPct}%`, height: `${heightPct}%`,
                        touchAction: isEditMode ? 'none' : undefined,
                      }}
                      className={`absolute rounded-md border-2 border-dashed transition-colors ${borderClass} ${isEditMode ? 'cursor-move' : 'cursor-pointer'} ${
                        color === 'red' ? 'bg-red-500/5' : color === 'amber' ? 'bg-amber-500/5' : ''
                      }`}
                    >
                      {/* 라벨/뱃지/삭제버튼은 전부 구역 박스 안쪽에 그림 - 밖으로 튀어나오게(-top-2.5 등)
                          그리면 구역이 도면 가장자리에 붙어있을 때 컨테이너의 overflow-hidden에
                          잘려서 안 보였음 */}
                      {/* 정상/경고/위험 개수 - 클릭 안 해도 대략적인 심각도를 바로 볼 수 있게 */}
                      <span className={`absolute bottom-1 left-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold whitespace-nowrap flex items-center gap-1 ${
                        isDarkMode ? 'bg-[#0A0E1A] text-[#B9C2DE]' : 'bg-white text-gray-600 border border-gray-200'
                      }`}>
                        <span className="text-green-500">{counts.normal}</span>·
                        <span className="text-amber-500">{counts.warning}</span>·
                        <span className="text-red-500">{counts.danger}</span>
                      </span>

                      {!isEditMode && isOpen && (
                        <div
                          ref={zonePopoverRef}
                          onClick={(e) => e.stopPropagation()}
                          className={`absolute z-40 top-7 left-1 w-52 max-h-64 overflow-y-auto rounded-lg border p-2 text-[11px] shadow-lg space-y-1 ${
                            isDarkMode ? 'bg-[#12172A] border-[#232B45] text-[#B9C2DE]' : 'bg-white border-gray-200 text-gray-600'
                          }`}
                        >
                          <p className={`font-bold px-1 pb-1 border-b mb-1 ${isDarkMode ? 'text-[#EDF1FC] border-[#232B45]' : 'text-gray-800 border-gray-200'}`}>
                            {zone.name} ({zoneEquipments.length})
                          </p>
                          {zoneEquipments.length === 0 ? (
                            <p className="px-1 py-1 opacity-70">이 구역에 배치된 설비가 없습니다.</p>
                          ) : (
                            zoneEquipments.map(eq => {
                              const meta = getStatusMeta(metricTab === 'temperature' ? eq.status : eq.powerStatus);
                              return (
                                <button
                                  key={eq.equipId}
                                  type="button"
                                  onClick={() => { setSelectedEquipId(eq.equipId); setOpenZoneId(null); }}
                                  className={`w-full flex items-center gap-1.5 px-1.5 py-1 rounded text-left cursor-pointer ${
                                    isDarkMode ? 'hover:bg-[#1A2036]' : 'hover:bg-gray-100'
                                  }`}
                                >
                                  <span className={`status-dot shrink-0 ${STATUS_DOT_CLASS[meta.color]} ${meta.color === 'red' ? 'animate-pulse' : ''}`} />
                                  <span className="truncate">{eq.equipName}</span>
                                </button>
                              );
                            })
                          )}
                        </div>
                      )}

                      {isRenaming ? (
                        <input
                          autoFocus
                          value={renameDraft}
                          onChange={(e) => setRenameDraft(e.target.value)}
                          onBlur={commitRenameZone}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitRenameZone();
                            if (e.key === 'Escape') setRenamingZoneId(null);
                          }}
                          onPointerDown={(e) => e.stopPropagation()}
                          className={`absolute top-1 left-1 px-1 text-[10px] font-bold rounded w-24 outline-none border ${
                            isDarkMode ? 'bg-[#0A0E1A] text-white border-[#22D3EE]' : 'bg-white text-gray-800 border-green-500'
                          }`}
                        />
                      ) : (
                        <span
                          onDoubleClick={(e) => { if (isEditMode) { e.stopPropagation(); startRenameZone(zone); } }}
                          onPointerDown={(e) => e.stopPropagation()}
                          title={isEditMode ? '더블클릭해서 이름 바꾸기' : zone.name}
                          className={`absolute top-1 left-1 px-1.5 text-[10px] font-bold rounded whitespace-nowrap ${
                            isDarkMode ? 'bg-[#0A0E1A] text-[#EDF1FC]' : 'bg-white text-gray-800'
                          } ${isEditMode ? 'cursor-text' : ''}`}
                        >
                          {zone.name}
                        </span>
                      )}
                      {isEditMode && (
                        <>
                          <button
                            type="button"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => { e.stopPropagation(); handleDeleteZone(zone.id); }}
                            title="구역 삭제"
                            className={`absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center text-[10px] leading-none ${
                              isDarkMode ? 'bg-[#1A2036] text-[#9FACC9] hover:text-white' : 'bg-white text-gray-500 hover:text-red-600 border border-gray-300'
                            }`}
                          >
                            ×
                          </button>
                          <div
                            onPointerDown={handleZonePointerDown(zone.id, 'resize')}
                            title="드래그해서 크기 조절"
                            className="absolute bottom-0 right-0 w-3.5 h-3.5 cursor-nwse-resize"
                            style={{ touchAction: 'none' }}
                          >
                            <div
                              className={isDarkMode ? 'bg-[#22D3EE]' : 'bg-green-600'}
                              style={{ width: '100%', height: '100%', clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  );
                });
              })()}

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
                  // 라벨이 점 아래에 붙는데, 점이 도면 아래쪽 가장자리 가까이 있으면 라벨이
                  // 컨테이너 밖(overflow-hidden에 잘리는 영역)으로 넘어가서 반토막나 보였음 -
                  // 그 경우엔 라벨을 점 위로 뒤집어서 그림
                  const labelAbove = topPct > 85;
                  return (
                    <div
                      key={eq.equipId}
                      onPointerDown={handleMarkerPointerDown(eq.equipId)}
                      onClick={(e) => {
                        if (e.ctrlKey || e.metaKey) return; // ctrl+클릭은 다중 선택용 - 상세보기를 안 엶
                        if (!isEditMode) setSelectedEquipId(eq.equipId);
                      }}
                      title={
                        isEditMode
                          ? `${eq.equipName} (클릭: 선택 후 Delete로 배치 해제 / ctrl+클릭: 다중 선택 / shift+클릭: 가로줄 정렬 / 선택된 걸 드래그: 다같이 이동)`
                          : `${eq.equipName} (ctrl+클릭: 여러 개 선택해서 비교 보기)`
                      }
                      style={{ left: `${leftPct}%`, top: `${topPct}%`, touchAction: isEditMode ? 'none' : undefined }}
                      className={`absolute flex items-center gap-1 -translate-x-1/2 -translate-y-1/2 ${labelAbove ? 'flex-col-reverse' : 'flex-col'} ${isEditMode ? 'cursor-move' : 'cursor-pointer'} ${
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
                  const labelAbove = topPct > 85;
                  markers.push(
                    <div
                      key="__drag-preview__"
                      className={`absolute flex items-center gap-1 -translate-x-1/2 -translate-y-1/2 pointer-events-none ${labelAbove ? 'flex-col-reverse' : 'flex-col'}`}
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

        </div>
      </div>

      <CustomAlert message={alertMessage} onClose={() => setAlertMessage('')} isDarkMode={isDarkMode} />
      <CustomConfirm
        message={isResetConfirmOpen ? '배치된 설비 마커를 모두 지우시겠습니까?' : ''}
        onConfirm={handleResetPositions}
        onCancel={() => setIsResetConfirmOpen(false)}
        isDarkMode={isDarkMode}
      />

      {isHelpOpen && (
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center p-4"
          style={{ backgroundColor: isDarkMode ? 'rgba(5, 8, 16, 0.75)' : 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(3px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setIsHelpOpen(false); }}
        >
          <div className={`w-full max-w-[520px] max-h-[80vh] overflow-y-auto rounded-2xl shadow-2xl border ${
            isDarkMode ? 'bg-[#12172A] border-[#232B45] text-[#B9C2DE]' : 'bg-white border-gray-200 text-gray-600'
          }`}>
            <div className={`px-6 py-5 flex items-center justify-between border-b sticky top-0 ${
              isDarkMode ? 'bg-[#0D1224] border-[#232B45] text-[#EDF1FC]' : 'bg-gray-50 border-gray-200 text-gray-800'
            }`}>
              <h2 className="text-[16px] font-bold tracking-tight m-0">설비 배치도 사용법</h2>
              <button
                onClick={() => setIsHelpOpen(false)}
                className={`text-2xl leading-none transition-colors outline-none bg-transparent border-none cursor-pointer ${
                  isDarkMode ? 'text-[#7D87A8] hover:text-[#EDF1FC]' : 'text-gray-400 hover:text-gray-800'
                }`}
              >
                &times;
              </button>
            </div>

            <div className="p-6 space-y-5 text-[12px] leading-relaxed">
              <div>
                <h3 className={`text-[13px] font-bold mb-1.5 ${isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-800'}`}>보기 모드</h3>
                <ul className="list-disc pl-4 space-y-1">
                  <li>마커 클릭 → 추이 상세보기</li>
                  <li>구역 클릭 → 안에 있는 설비 목록 (목록에서 클릭하면 상세보기)</li>
                  <li>Ctrl+클릭 → 여러 개 선택 → "비교 보기"로 한 차트에 겹쳐보기</li>
                </ul>
              </div>
              <div>
                <h3 className={`text-[13px] font-bold mb-1.5 ${isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-800'}`}>편집 모드 (톱니바퀴)</h3>
                <ul className="list-disc pl-4 space-y-1">
                  <li>도면 좌상단 "배치되지 않은 설비" 목록(접기/펼치기 가능)에서 칩을 도면으로 드래그 → 배치</li>
                  <li>마커 드래그 → 재배치 / 클릭만 → 선택 (Delete로 배치 해제)</li>
                  <li>Ctrl+클릭 → 다중 선택 → 그중 하나를 드래그하면 다같이 이동, Shift+클릭하면 가로줄 정렬</li>
                  <li>빈 배경 클릭 → 선택 해제</li>
                  <li>랜덤 배치 / 배치 초기화 / 이미지 업로드(또는 드래그로 교체)</li>
                </ul>
              </div>
              <div>
                <h3 className={`text-[13px] font-bold mb-1.5 ${isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-800'}`}>구역</h3>
                <ul className="list-disc pl-4 space-y-1">
                  <li>"구역 추가"로 생성 → 몸통 드래그로 이동, 모서리 드래그로 크기 조절</li>
                  <li>이름 더블클릭으로 변경, × 로 삭제</li>
                  <li>테두리색 = 안에 있는 설비 중 제일 안 좋은 상태, 아래 숫자 = 정상·경고·위험 개수</li>
                </ul>
              </div>
              <p className={`text-[11px] ${isDarkMode ? 'text-[#5C6584]' : 'text-gray-400'}`}>
                배치도 이미지·설비 위치·구역은 이 브라우저에만 저장됩니다.
              </p>
            </div>
          </div>
        </div>
      )}

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

      {isCompareOpen && multiSelectedIds.length >= 2 && (
        <EquipmentCompareModal
          equipIds={multiSelectedIds}
          equipments={equipments}
          metricTab={metricTab}
          onClose={() => setIsCompareOpen(false)}
          isDarkMode={isDarkMode}
        />
      )}
    </div>
  );
};

export default PlantMapScreen;
