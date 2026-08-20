// CSV 생성(문자열 이어붙이기)을 메인 스레드 밖에서 처리. 메인 스레드에서는 이미 가공된 행
// 데이터(exportData)만 넘겨받아 워커에 전달함 - 시뮬레이션/실시간 모니터링 양쪽의 내보내기가
// 공통으로 씀. 행이 아주 많아도(수만 건) 텍스트를 이어붙이는 수준이라 XLSX 바이너리 인코딩보다
// 훨씬 가벼움 (대신 열 너비 같은 서식은 없음)

const escapeCsvCell = (value) => {
  if (value == null) return '';
  const s = String(value);
  return (s.includes(',') || s.includes('"') || s.includes('\n')) ? `"${s.replace(/"/g, '""')}"` : s;
};

self.onmessage = (e) => {
  try {
    const { exportData } = e.data;
    const headers = exportData.length ? Object.keys(exportData[0]) : [];
    const lines = [headers.join(',')];
    exportData.forEach(row => {
      lines.push(headers.map(h => escapeCsvCell(row[h])).join(','));
    });
    // BOM을 붙여야 엑셀에서 UTF-8 한글이 깨지지 않고 열림
    const csvText = '﻿' + lines.join('\n');
    const buffer = new TextEncoder().encode(csvText).buffer;
    self.postMessage({ ok: true, buffer }, [buffer]);
  } catch (err) {
    self.postMessage({ ok: false, error: err.message });
  }
};
