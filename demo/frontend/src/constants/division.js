export const DIVISION_MAP = {
  '001': '관리자',
  '329': '개발2팀'
};

export const getDivisionName = (code) => DIVISION_MAP[code] || code || '';