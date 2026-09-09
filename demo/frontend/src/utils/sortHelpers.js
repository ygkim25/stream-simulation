// 설비 ID 오름차순 비교 (숫자형 ID는 숫자로, 아니면 문자열로 비교) - 표 헤더 정렬의 기본값으로 사용
export const compareByEquipId = (a, b) => {
  const aNum = Number(a.equipId);
  const bNum = Number(b.equipId);
  if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) return aNum - bNum;
  return String(a.equipId).localeCompare(String(b.equipId));
};

// 상태(정상/경고/위험) 컬럼 정렬 시 우선순위
export const STATUS_SORT_ORDER = { 정상: 0, 경고: 1, 위험: 2 };
