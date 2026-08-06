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
