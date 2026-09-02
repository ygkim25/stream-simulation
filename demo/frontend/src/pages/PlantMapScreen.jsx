import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Client } from '@stomp/stompjs';
import Header from '../components/Header';
import CustomConfirm from '../components/CustomConfirm';
import EquipmentHistoryModal from '../components/EquipmentHistoryModal';
import EquipmentCompareModal from '../components/EquipmentCompareModal';
import PlantMap3DView from '../components/PlantMap3DView';
import EquipShapePanel from '../components/EquipShapePanel';
import FloatingPanel from '../components/FloatingPanel';
import { saveModelBlob, deleteModelBlob } from '../utils/plantMapModelsDb';
import { getStatusMeta, STATUS_DOT_CLASS, DEFAULT_STATUS_INFO_LINES } from '../utils/statusStyles';
import { API_BASE_URL, WS_BASE_URL } from '../utils/apiConfig';
import { EMPTY_EQUIP_ROW, mergeTempDto, mergeElecDto, mergeEquipmentLists } from '../utils/equipmentMerge';
import { saveToDB } from '../utils/indexedDb';
import { useClickOutside } from '../utils/useClickOutside';
import {
  FLOORPLAN_IMAGE_URL,
  loadStoredPositions, savePositions,
  loadStoredZones, saveZones,
  loadStoredEquipShapes, saveEquipShapes, generateModelId,
} from '../utils/plantMapStorage';
// 구역 안 설비 중 제일 안 좋은 상태로 구역 색을 정함 (위험 > 경고 > 정상)
const STATUS_COLOR_PRIORITY = { red: 2, amber: 1, green: 0 };
const ZONE_BORDER_CLASS = {
  green: { dark: 'border-[#34D399]', light: 'border-green-500' },
  amber: { dark: 'border-[#FBBF24]', light: 'border-amber-500' },
  red: { dark: 'border-[#FB5D75]', light: 'border-red-500' },
};

// 3D 보기로 전환될 때 바로 팝업되지 않고 살짝 페이드인되게 하는 래퍼
const FadeIn = ({ children }) => {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    // rAF를 한 번만 걸면 opacity:0 상태가 화면에 실제로 그려지기 전에 곧바로 1로 바뀌어서
    // 트랜지션 없이 뚝 나타나 보임 - 한 프레임 더 기다렸다가 값을 바꿔야 브라우저가 0 상태를
    // 먼저 그린 뒤 진짜로 페이드인됨
    let id2;
    const id1 = requestAnimationFrame(() => {
      id2 = requestAnimationFrame(() => setVisible(true));
    });
    return () => {
      cancelAnimationFrame(id1);
      cancelAnimationFrame(id2);
    };
  }, []);
  return (
    <div
      className="w-full h-full"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'scale(1)' : 'scale(0.97)',
        transition: 'opacity 320ms ease-out, transform 320ms ease-out',
      }}
    >
      {children}
    </div>
  );
};

const PlantMapScreen = ({ user, route, setRoute, openMyPage, isDarkMode, setIsDarkMode, isAlarmOn, setIsAlarmOn }) => {
  const [equipments, setEquipments] = useState([]);
  const image = FLOORPLAN_IMAGE_URL;
  const [positions, setPositions] = useState(() => loadStoredPositions());
  const [isEditMode, setIsEditMode] = useState(false);
  // 3D는 보기 전용 - 배치/구역 편집(포인터 좌표 계산)은 2D에서만 동작하므로 편집 모드 진입 시 자동으로 꺼짐
  // (렌더 중 조정 패턴 - effect에서 setState하면 캐스케이딩 렌더 경고가 발생함)
  const [is3DView, setIs3DView] = useState(false);
  const [prevIsEditMode, setPrevIsEditMode] = useState(isEditMode);
  if (isEditMode !== prevIsEditMode) {
    setPrevIsEditMode(isEditMode);
    if (isEditMode) setIs3DView(false);
  }
  // 편집 모드에서 2D로 배치를 바꾸면서 결과를 바로바로 3D로 확인할 수 있게 하는 작은 미리보기
  // 인셋. body 포털에 fixed로 띄우는 진짜 떠 있는 창이라 화면 기준 좌표(px)로 관리함
  const [show3DPreview, setShow3DPreview] = useState(false);
  const [previewPos, setPreviewPos] = useState({ x: 16, y: 100 });
  const [previewSize, setPreviewSize] = useState({ width: 320, height: 224 });
  // 사용자가 직접 옮긴 적이 없으면, 열 때마다 "도면 영역" 좌하단에 맞춰 새로 계산함(창 크기가
  // 달라도 항상 도면 바로 위 왼쪽 아래에 뜨게) - 한 번이라도 직접 옮기면 그 뒤로는 그 위치를 유지
  const hasMovedPreviewRef = useRef(false);
  const [metricTab, setMetricTab] = useState('temperature');
  const [selectedEquipId, setSelectedEquipId] = useState(null);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [isCompareOpen, setIsCompareOpen] = useState(false);
  // 배치되지 않은 설비 트레이 - 도면 이미지 위 오버레이라 열고 닫아도 도면 크기엔 영향 없음
  const [isTrayOpen, setIsTrayOpen] = useState(true);
  // 정상/경고/위험 판정 기준 팝오버
  const infoRef = useRef(null);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  useClickOutside(infoRef, () => setIsInfoOpen(false), isInfoOpen);
  // 이 화면 자체(클릭/드래그/구역/비교 등)의 사용법 안내 모달 - 항목이 많아서 작은 팝오버 대신 모달로
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  // 정렬용 다중 선택 - 순서 있는 배열로 들고 있어서 맨 처음 선택한 설비를 기준선으로 씀
  const [multiSelectedIds, setMultiSelectedIds] = useState([]);
  // 좌표(%)는 object-contain 레터박스를 뺀 "실제 이미지 영역" 기준
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [naturalSize, setNaturalSize] = useState(null);
  // 설비 배치는 HTML5 draggable 대신 포인터 이벤트로 직접 구현 (정교한 커서 추적 미리보기 위함)
  const [dragEquipId, setDragEquipId] = useState(null);
  const [dragPreviewPct, setDragPreviewPct] = useState(null); // {xPct, yPct} | null (도면 밖이면 null)
  const dragEquipIdRef = useRef(null);
  // 클릭인지 드래그인지는 시작 지점 대비 이동 거리로 판단 (거의 안 움직였으면 클릭=선택)
  const dragOriginRef = useRef('chip');
  const pointerDownPosRef = useRef({ x: 0, y: 0 });
  const CLICK_MOVE_THRESHOLD = 4;
  // 다중 선택된 것을 함께 드래그하는 그룹 이동 (상대 간격 유지, 델타만 적용)
  const [isGroupDragging, setIsGroupDragging] = useState(false);
  const [groupDragPreview, setGroupDragPreview] = useState(null); // { [equipId]: {xPct, yPct} } | null
  const groupDragRef = useRef(null); // { startPct, startPositions } - 이벤트 핸들러 전용, 렌더링에선 안 씀

  // 구역(zone) - 사각형 이동/크기조절도 위 마커 드래그와 같은 패턴(포인터 이벤트 + %기반 델타)
  const [zones, setZones] = useState(() => loadStoredZones());
  const [equipmentShapes, setEquipmentShapes] = useState(() => loadStoredEquipShapes());
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

  // 도면 컨테이너 크기 실시간 추적 (레이아웃/창 크기 변화 대응).
  // is3DView가 바뀌면 2D의 <div ref={mapRef}>가 언마운트/재마운트되어 mapRef.current가
  // 다른 DOM 노드로 바뀌므로, 그때마다 옵저버를 새 노드에 다시 붙여야 함 (안 그러면 3D 갔다가
  // 2D로 돌아왔을 때 예전 노드 크기 기준으로 남아있어 구역/마커 위치 계산이 어긋남)
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
  }, [is3DView]);

  // object-contain 규칙대로 "실제 이미지가 차지하는 영역"을 비율(0~1)로 계산 (zoom 배율 무관하게 정확하도록 px 대신 비율만 사용)
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

  // 0~100으로 자르지 않은 원본 좌표 반환 (클램프는 쓰는 쪽에서 각자 처리)
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

  // 컨테이너 경계 밖이면 null, 안이면 0~100으로 클램프 (단일 배치/재배치용)
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

  // 드래그 중 ctrl/cmd를 누르면 이동 취소하고 다중 선택에 추가
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

      // 거의 안 움직였으면 클릭으로 보고 선택만 함
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

  // 그룹 드래그 - 시작 위치 스냅샷 + 델타만 계산해서 전부에 적용
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

  // 구역 이동/크기조절 - 이동은 도면 밖으로 안 나가게, 크기는 최소 5% 유지
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

  // 설비별 3D 모양 오버라이드 - 프리셋 선택/모델 업로드/초기화. rotationY(회전)는 모양(프리셋/모델)을
  // 바꿔도 유지해야 자연스러워서, 새 엔트리를 만들 때 이전 값에서 넘겨받음
  const handleChangeShapePreset = (equipId, preset) => {
    setEquipmentShapes(prev => {
      const prevEntry = prev[equipId];
      if (prevEntry?.type === 'model') deleteModelBlob(prevEntry.modelId);
      const next = { ...prev, [equipId]: { type: 'preset', preset, rotationY: prevEntry?.rotationY || 0 } };
      saveEquipShapes(next);
      return next;
    });
  };

  const handleUploadShapeModel = async (equipId, file) => {
    const prevEntry = equipmentShapes[equipId];
    const modelId = generateModelId();
    await saveModelBlob(modelId, file, file.name);
    if (prevEntry?.type === 'model') deleteModelBlob(prevEntry.modelId);
    setEquipmentShapes(prev => {
      const next = { ...prev, [equipId]: { type: 'model', modelId, fileName: file.name, rotationY: prevEntry?.rotationY || 0 } };
      saveEquipShapes(next);
      return next;
    });
  };

  const handleChangeShapeRotation = (equipId, rotationY) => {
    setEquipmentShapes(prev => {
      const next = { ...prev, [equipId]: { ...prev[equipId], rotationY } };
      saveEquipShapes(next);
      return next;
    });
  };

  const handleResetShape = (equipId) => {
    setEquipmentShapes(prev => {
      const prevEntry = prev[equipId];
      if (prevEntry?.type === 'model') deleteModelBlob(prevEntry.modelId);
      const next = { ...prev };
      delete next[equipId];
      saveEquipShapes(next);
      return next;
    });
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

  // 선택된 마커를 Delete/Backspace로 배치 해제
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

  // 설비 목록 초기 조회(REST) + 실시간 갱신(WebSocket) - RealtimeScreen.jsx의 축소판
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
            // EquipmentHistoryModal이 IndexedDB에서 추이를 읽으므로 여기서도 저장
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

  const handleResetPositions = () => {
    setIsResetConfirmOpen(false);
    setPositions({});
    savePositions({});
    setMultiSelectedIds([]);
  };

  // 구역 안 아무 지점 (라벨 잘림 방지로 구역 크기의 15% 안쪽만 사용)
  const randomPointInZone = (zone) => {
    const insetX = zone.widthPct * 0.15;
    const insetY = zone.heightPct * 0.15;
    const spanX = Math.max(zone.widthPct - insetX * 2, 0);
    const spanY = Math.max(zone.heightPct - insetY * 2, 0);
    return {
      xPct: zone.xPct + insetX + Math.random() * spanX,
      yPct: zone.yPct + insetY + Math.random() * spanY,
    };
  };

  // 미배치 설비 일괄 배치 - location과 이름이 같은 구역이 있으면 그 안에, 없으면 도면 아무 데나
  const handleRandomPlace = () => {
    const placed = new Set(Object.keys(positions));
    const toPlace = equipments.filter(eq => !placed.has(eq.equipId));
    if (toPlace.length === 0) return;
    setPositions(prev => {
      const next = { ...prev };
      toPlace.forEach(eq => {
        const matchedZone = zones.find(z => z.name === eq.location);
        next[eq.equipId] = matchedZone
          ? randomPointInZone(matchedZone)
          : { xPct: 10 + Math.random() * 80, yPct: 10 + Math.random() * 80 };
      });
      savePositions(next);
      return next;
    });
  };

  // 특정 구역 하나만 수동으로 채우기 (location이 일치하는 미배치 설비만)
  const getUnplacedEquipmentsForZone = (zone) => {
    const placed = new Set(Object.keys(positions));
    return equipments.filter(eq => !placed.has(eq.equipId) && eq.location === zone.name);
  };
  const handleRandomPlaceInZone = (zone) => {
    const toPlace = getUnplacedEquipmentsForZone(zone);
    if (toPlace.length === 0) return;
    setPositions(prev => {
      const next = { ...prev };
      toPlace.forEach(eq => { next[eq.equipId] = randomPointInZone(zone); });
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

  // Ctrl/Cmd+클릭: 다중 선택 토글 (보기/편집 모드 모두 동작, 나머지는 편집 모드 전용)
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
    // 다중 선택된 것 중 하나를 일반 클릭하면 그룹 드래그
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
    // 클릭/드래그 구분은 handleUp에서 이동 거리로 판단
    handleEquipPointerDown(equipId, 'marker')(e);
  };

  // 배치 목록은 저장된 위치 기준으로 만듦 - 실시간 데이터가 아직 없어도 기본값으로 마커부터 그림
  const placedIds = new Set(Object.keys(positions));
  const equipmentById = new Map(equipments.map(eq => [eq.equipId, eq]));
  const placedEquipments = Object.keys(positions).map(id => (
    equipmentById.get(id) || { ...EMPTY_EQUIP_ROW, equipId: id, equipName: id }
  ));
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

      <div className="flex-1 min-h-0 p-4 lg:p-6 flex flex-col gap-3 screen-enter">
        {/* 상단 툴바: 온도/전력 토글 + 배치 편집 모드 */}
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
            {/* 3D 보기 토글 - 편집 모드에선 좌표 계산이 2D 기준이라 숨김. 왼쪽 아이콘들 앞이 아니라
                여기 우측 그룹에 둬서, 편집 모드를 켜고 끌 때 이 버튼이 사라져도 앞쪽 정상/경고/위험·
                사용법 아이콘 위치가 안 밀리게 함 */}
            {!isEditMode && (
              <button
                type="button"
                onClick={() => setIs3DView(v => !v)}
                className={`px-2.5 py-1.5 rounded-full text-[11px] font-bold tracking-wide transition-colors border shrink-0 ${
                  is3DView
                    ? (isDarkMode ? 'bg-[#1E2A4A] text-[#22D3EE] border-[#22D3EE]/40' : 'bg-white text-green-700 border-gray-300 shadow-sm')
                    : (isDarkMode ? 'text-[#7D87A8] hover:text-[#B9C2DE] border-transparent bg-[#0D1224]' : 'text-gray-500 hover:text-gray-800 border-transparent bg-gray-100')
                }`}
              >
                {is3DView ? '2D' : '3D'}
              </button>
            )}
            {isEditMode && (
              <>
                {unplacedEquipments.length > 0 && (
                  <button
                    type="button"
                    onClick={handleRandomPlace}
                    title="배치되지 않은 설비들을 위치(location)와 이름이 같은 구역이 있으면 그 구역 안에, 없으면 도면 아무 곳에나 한 번에 뿌립니다"
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
                <button
                  type="button"
                  onClick={() => {
                    if (!show3DPreview && !hasMovedPreviewRef.current && mapRef.current) {
                      const rect = mapRef.current.getBoundingClientRect();
                      setPreviewPos({ x: rect.left - 5, y: rect.bottom - previewSize.height - 76 });
                    }
                    setShow3DPreview(v => !v);
                  }}
                  title="2D에서 편집한 내용을 작은 3D 창으로 실시간으로 확인합니다"
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors border ${
                    show3DPreview
                      ? (isDarkMode ? 'bg-[#1E2A4A] text-[#22D3EE] border-[#22D3EE]/40' : 'bg-green-50 text-green-700 border-green-300')
                      : (isDarkMode ? 'border-[#232B45] hover:border-[#2A335A] hover:bg-[#151B30] text-[#9FACC9] hover:text-[#EDF1FC]' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-100 text-gray-600 hover:text-gray-900')
                  }`}
                >
                  3D 미리보기
                </button>
              </>
            )}

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
          {is3DView ? (
            <FadeIn>
              <PlantMap3DView
                image={image}
                placedEquipments={placedEquipments}
                positions={positions}
                zones={zones}
                metricTab={metricTab}
                isDarkMode={isDarkMode}
                equipmentShapes={equipmentShapes}
                onSelectEquip={setSelectedEquipId}
              />
            </FadeIn>
          ) : (
          <>
          {/* 다중 선택(ctrl+클릭) 상태 - flex 흐름에 넣으면 선택/해제될 때마다 이 패널이
              생겼다 없어지면서 도면 영역 높이가 바뀌어 이미지가 커졌다 작아졌다 했음(이전에
              "배치되지 않은 설비 N개" 문구에서 겪은 것과 같은 문제) - 도면 위에 반투명
              오버레이로 띄워서 레이아웃에 영향을 안 주게 함 */}
          {multiSelectedIds.length > 0 && (() => {
            const names = multiSelectedIds
              .map(id => equipments.find(eq => eq.equipId === id)?.equipName)
              .filter(Boolean);
            const nameLabel = names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} 외 ${names.length - 3}개`;
            // 이미지 위 오버레이라 다크모드에서도 라이트 모드 색으로 고정
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
              열고 닫아도(isTrayOpen) 도면 크기에 전혀 영향이 없게 함. 목록 높이가 고정값(14rem)이라
              도면이 큰 화면에서는 아래쪽이 많이 비어보인다는 피드백으로, 도면 영역 전체 높이만큼
              늘어나게(헤더는 고정, 목록만 flex-1로 나머지를 채움) 바꿈 */}
          {isEditMode && (
            <div className={`absolute z-20 top-2 left-2 max-w-[220px] max-h-[calc(100%-1rem)] flex flex-col rounded-lg backdrop-blur-sm ${
              isDarkMode ? 'bg-[#0A0E1A]/70' : 'bg-white/80'
            }`}>
              <button
                type="button"
                onClick={() => setIsTrayOpen(v => !v)}
                className={`shrink-0 w-full flex items-center justify-between gap-3 px-3 py-2 text-[11px] font-semibold ${
                  isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-800'
                }`}
              >
                <span>배치되지 않은 설비 ({unplacedEquipments.length})</span>
                <span className={`transition-transform text-[9px] ${isTrayOpen ? '' : '-rotate-90'}`}>▾</span>
              </button>
              {isTrayOpen && (
                <div className="px-3 pb-3 flex-1 min-h-0 overflow-y-auto flex flex-col gap-1.5">
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

          <div
            ref={mapRef}
            onPointerDown={(e) => {
                // 배경(빈 이미지 영역) 클릭 시 다중 선택 해제 - pointerDown에서 처리(click은 그룹 이동 직후 선택이 바로 풀림)
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
                          {getUnplacedEquipmentsForZone(zone).length > 0 && (
                            <button
                              type="button"
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => { e.stopPropagation(); handleRandomPlaceInZone(zone); }}
                              title={`위치가 "${zone.name}"인 배치되지 않은 설비들을 이 구역 안에 랜덤 배치`}
                              className={`absolute top-1 right-5 w-4 h-4 rounded-full flex items-center justify-center ${
                                isDarkMode ? 'bg-[#1A2036] text-[#9FACC9] hover:text-white' : 'bg-white text-gray-500 hover:text-green-600 border border-gray-300'
                              }`}
                            >
                              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4h4l12 16h-4L4 4zm16 0h-4l-3.2 4.267M4 20h4l3.2-4.267" />
                              </svg>
                            </button>
                          )}
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
                // px 대신 CSS %로 그려서 zoom 배율과 무관하게 정확함
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
                  // 점이 하단 가장자리 가까이 있으면 라벨을 위로 뒤집어서 잘림 방지
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
                      {/* 선택 여부는 테두리 색으로만 구분 - box-shadow 링을 추가로 씌우면 선택된
                          핀만 실제보다 커 보여서(약 4px 더 큰 시각적 크기) 핀 크기가 제각각인
                          것처럼 보였음. 모든 핀이 항상 같은 크기(w-3.5 h-3.5)를 유지하게 함 */}
                      <span className={`w-3.5 h-3.5 rounded-full border-2 shadow ${STATUS_DOT_CLASS[meta.color]} ${meta.color === 'red' ? 'animate-pulse' : ''} ${
                        isSelected ? (isDarkMode ? 'border-[#22D3EE]' : 'border-green-600') : 'border-white'
                      }`} />
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-black/60 text-white whitespace-nowrap">
                        {eq.equipName}
                      </span>
                    </div>
                  );
                });

                // 드래그 미리보기도 같은 CSS % 방식으로 그려서 실제 위치와 정확히 일치
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

            {/* 2D 편집 중 실시간 3D 확인용 떠 있는 창 - 배치/구역을 바꿀 때마다 같은 props가
                그대로 다시 렌더돼서 별도 동기화 로직 없이 항상 최신 상태를 보여줌.
                simplified로 등장 애니메이션/경고 링 펄스 같은 장식 효과는 꺼서 계속 다시
                그려져도 정신없지 않게 함 */}
            {show3DPreview && (
              <FloatingPanel
                title="3D 미리보기"
                isDarkMode={isDarkMode}
                pos={previewPos}
                size={previewSize}
                onPosChange={setPreviewPos}
                onSizeChange={setPreviewSize}
                onDragStart={() => { hasMovedPreviewRef.current = true; }}
                onClose={() => setShow3DPreview(false)}
              >
                <PlantMap3DView
                  image={image}
                  placedEquipments={placedEquipments}
                  positions={positions}
                  zones={zones}
                  metricTab={metricTab}
                  isDarkMode={isDarkMode}
                  equipmentShapes={equipmentShapes}
                  onSelectEquip={() => {}}
                  simplified
                />
              </FloatingPanel>
            )}

            {/* 3D 모양 설정 패널 - "배치되지 않은 설비" 트레이와 같은 패턴으로 도면 위 오버레이
                (레이아웃에 영향 안 주고, 우측 상단에 떠 있음) */}
            {isEditMode && multiSelectedIds.length === 1 && (() => {
              const selectedEquipId = multiSelectedIds[0];
              const selectedEquip = equipments.find(eq => eq.equipId === selectedEquipId)
                || { ...EMPTY_EQUIP_ROW, equipId: selectedEquipId, equipName: selectedEquipId };
              return (
                <div className="absolute z-20 top-2 right-2">
                  <EquipShapePanel
                    key={selectedEquipId}
                    equip={selectedEquip}
                    shapeConfig={equipmentShapes[selectedEquipId] || null}
                    onChangePreset={(preset) => handleChangeShapePreset(selectedEquipId, preset)}
                    onUploadModel={(file) => handleUploadShapeModel(selectedEquipId, file)}
                    onChangeRotation={(rotationY) => handleChangeShapeRotation(selectedEquipId, rotationY)}
                    onReset={() => handleResetShape(selectedEquipId)}
                    isDarkMode={isDarkMode}
                  />
                </div>
              );
            })()}
          </>
          )}
        </div>
      </div>

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
                  <li>랜덤 배치(위치=구역 이름이 같으면 그 구역 안에, 아니면 도면 아무 곳) / 배치 초기화</li>
                </ul>
              </div>
              <div>
                <h3 className={`text-[13px] font-bold mb-1.5 ${isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-800'}`}>구역</h3>
                <ul className="list-disc pl-4 space-y-1">
                  <li>"구역 추가"로 생성 → 몸통 드래그로 이동, 모서리 드래그로 크기 조절</li>
                  <li>이름 더블클릭으로 변경, 셔플 아이콘으로 이 구역 안에 랜덤 배치, × 로 삭제</li>
                  <li>테두리색 = 안에 있는 설비 중 제일 안 좋은 상태, 아래 숫자 = 정상·경고·위험 개수</li>
                </ul>
              </div>
              <p className={`text-[11px] ${isDarkMode ? 'text-[#5C6584]' : 'text-gray-400'}`}>
                설비 위치·구역은 이 브라우저에만 저장됩니다.
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
