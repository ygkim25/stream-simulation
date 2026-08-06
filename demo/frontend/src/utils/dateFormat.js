// datetime-local input 포맷 변환 (YYYY-MM-DDTHH:mm)
export const formatForDateTimeInput = (date) => {
  if (!date || isNaN(date.getTime())) return '';
  const tzoffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzoffset).toISOString().slice(0, 16);
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
