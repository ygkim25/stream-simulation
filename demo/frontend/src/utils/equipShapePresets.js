// 설비 3D 모양 프리셋 관련 상수/함수 - PlantMap3DView(배치도)와 EquipShapePanel(미리보기)에서 같이 씀.
// 컴포넌트(EquipShape3D.jsx)와 분리해둔 이유: 컴포넌트 파일이 상수/함수까지 같이 export하면
// Fast Refresh가 안 먹혀서(react-refresh/only-export-components) 에디터에서 수정할 때마다
// 전체 새로고침이 걸림
export const STATUS_HEX = { green: '#22C55E', amber: '#F59E0B', red: '#EF4444' };

export const SHAPE_PRESETS = [
  { key: 'box', label: '박스' },
  { key: 'conveyor', label: '컨베이어' },
  { key: 'pump', label: '펌프' },
  { key: 'compressor', label: '압축기' },
  { key: 'tank', label: '탱크' },
  { key: 'transformer', label: '변압기' },
  { key: 'fan', label: '팬' },
  { key: 'robot', label: '로봇' },
  { key: 'dust', label: '집진기' },
];

// 설비명에 들어간 키워드로 대략적인 모양을 골라줌 - 실제 3D 모델 없이도 종류별로 다르게
// 보이도록 박스/실린더/콘 몇 개를 조합한 간단한 프리셋만 사용함
export const classifyShape = (name = '') => {
  if (name.includes('컨베이어')) return 'conveyor';
  if (name.includes('펌프')) return 'pump';
  if (name.includes('압축기')) return 'compressor';
  if (name.includes('냉동기') || name.includes('보일러') || name.includes('탱크')) return 'tank';
  if (name.includes('변압기')) return 'transformer';
  if (name.includes('팬')) return 'fan';
  if (name.includes('로봇')) return 'robot';
  if (name.includes('집진기')) return 'dust';
  return 'box';
};
