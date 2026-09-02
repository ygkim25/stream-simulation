// 설비 배치도(PlantMapScreen)에서 편집한 배치/구역/3D 모양 설정을 읽는 공용 유틸.
// 전부 브라우저 localStorage에만 저장되며(백엔드 스키마 변경 없음), 시뮬레이션 화면의 3D
// 보기처럼 같은 배치를 재사용하는 다른 화면에서도 이 파일을 통해 읽는다.
export const FLOORPLAN_IMAGE_URL = '/test-floorplan.svg';

const POSITIONS_KEY = 'plantMapPositions';
const ZONES_KEY = 'plantMapZones';
const EQUIP_SHAPES_KEY = 'plantMapEquipShapes';

export const loadStoredPositions = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(POSITIONS_KEY));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch { return {}; }
};
export const savePositions = (positions) => {
  try { localStorage.setItem(POSITIONS_KEY, JSON.stringify(positions)); } catch { /* 세션 메모리로만 유지 */ }
};

// 구역(zone) - 도면 위 이름 붙은 사각형. 좌표는 이미지 기준 %로 저장(xPct/yPct/widthPct/heightPct)
export const loadStoredZones = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(ZONES_KEY));
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
};
export const saveZones = (zones) => {
  try { localStorage.setItem(ZONES_KEY, JSON.stringify(zones)); } catch { /* 세션 메모리로만 유지 */ }
};

// 설비별 3D 모양 오버라이드 - { [equipId]: { type: 'preset', preset } | { type: 'model', modelId, fileName }, rotationY }.
// 값이 없는 설비는 3D 보기에서 이름 기반 자동 추정(classifyShape)을 그대로 씀
export const generateModelId = () => `model-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
export const loadStoredEquipShapes = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(EQUIP_SHAPES_KEY));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch { return {}; }
};
export const saveEquipShapes = (shapes) => {
  try { localStorage.setItem(EQUIP_SHAPES_KEY, JSON.stringify(shapes)); } catch { /* 세션 메모리로만 유지 */ }
};
