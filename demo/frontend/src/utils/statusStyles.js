// 설비 상태값("경고"/"위험") 여부 판별
export const isWarningStatus = (status) => status === '경고' || status === '위험';

// 그리드 상태 3단계(정상/경고/위험) 색상 매핑
export const STATUS_STYLES = {
  green: {
    dark: { text: 'text-[#34D399]', dot: 'bg-[#34D399]' },
    light: { text: 'text-green-600', dot: 'bg-green-600' },
  },
  amber: {
    dark: { text: 'text-amber-400', dot: 'bg-amber-400' },
    light: { text: 'text-amber-600', dot: 'bg-amber-500' },
  },
  red: {
    dark: { text: 'text-[#FB5D75]', dot: 'bg-[#FB5D75]' },
    light: { text: 'text-red-600', dot: 'bg-red-600' },
  },
};

export const getStatusMeta = (status) => {
  if (status === '위험' || status === 'DANGER') return { label: '위험', color: 'red' };
  if (status === '경고' || status === 'WARNING') return { label: '경고', color: 'amber' };
  return { label: '정상', color: 'green' };
};

// 상태 점(닷) 배경색 - 알람 패널/설비 배치도 등 여러 화면에서 공통으로 씀
export const STATUS_DOT_CLASS = { green: 'bg-green-500', amber: 'bg-amber-500', red: 'bg-red-500' };

// 정상/경고/위험 판정 기준 설명(실시간 화면 기준) - 백엔드 EquipmentTempStatusService/
// EquipmentElecStatusService의 WARNING_MARGIN=5 규칙과 맞춰둠. 시뮬레이션처럼 다른 규칙을
// 쓰는 화면은 이 기본값 대신 자체 설명 배열을 만들어 씀
export const DEFAULT_STATUS_INFO_LINES = [
  { color: 'green', label: '정상', desc: '값이 임계값보다 5 이상 낮은 상태' },
  { color: 'amber', label: '경고', desc: '값이 임계값보다 낮지만 그 차이가 5 미만인 상태(근접)' },
  { color: 'red', label: '위험', desc: '값이 임계값 이상인 상태(도달/초과)' },
];
