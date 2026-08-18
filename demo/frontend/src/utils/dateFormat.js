// datetime-local input 포맷 변환 (YYYY-MM-DDTHH:mm)
export const formatForDateTimeInput = (date) => {
  if (!date || isNaN(date.getTime())) return '';
  const tzoffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzoffset).toISOString().slice(0, 16);
};

// "YYYY.M.D 오전/오후 H:mm:ss" 형식으로 포맷 (toLocaleString('ko-KR')는 "YYYY. M. D. 오전 H:mm:ss"처럼
// 점 뒤에 공백이 붙고 날짜 끝에도 점이 남아서 지저분해 보이는 문제가 있어 직접 포맷함)
export const formatKoreanDateTime = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (!value || Number.isNaN(date.getTime())) return '-';
  const yyyy = date.getFullYear();
  const mm = date.getMonth() + 1;
  const dd = date.getDate();
  const hours24 = date.getHours();
  const period = hours24 < 12 ? '오전' : '오후';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const min = String(date.getMinutes()).padStart(2, '0');
  const sec = String(date.getSeconds()).padStart(2, '0');
  return `${yyyy}.${mm}.${dd} ${period} ${hours12}:${min}:${sec}`;
};

// "YYYY-MM-DD 오전/오후 HH:mm" 형식으로 포맷
export const formatFullDateTime = (date) => {
  if (!date || isNaN(date.getTime())) return '-';
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hours24 = date.getHours();
  const period = hours24 < 12 ? '오전' : '오후';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const hh = String(hours12).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${period} ${hh}:${min}`;
};
