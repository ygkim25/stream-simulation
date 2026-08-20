import * as XLSX from 'xlsx';

// 엑셀 내보내기의 실제 무거운 작업(시트/워크북 생성 + 바이너리 인코딩)을 메인 스레드 밖에서 처리.
// 메인 스레드에서는 이미 가공된 행 데이터(exportData)만 넘겨받아 워커에 전달함 - 시뮬레이션/
// 실시간 모니터링 양쪽의 엑셀 내보내기가 공통으로 씀
self.onmessage = (e) => {
  try {
    const { exportData, colWidths, sheetName } = e.data;
    // json_to_sheet은 행마다 키를 조회/매칭하는 비용이 있어서, 행이 많으면 aoa_to_sheet(이미
    // 헤더 순서대로 정렬된 배열의 배열)보다 눈에 띄게 느림 - 같은 결과물(.xlsx)을 더 빠르게 만듦
    const headers = exportData.length ? Object.keys(exportData[0]) : [];
    const aoa = [headers, ...exportData.map(row => headers.map(h => row[h]))];
    const worksheet = XLSX.utils.aoa_to_sheet(aoa);
    if (colWidths) worksheet['!cols'] = colWidths;
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName || '시트1');
    const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
    self.postMessage({ ok: true, buffer }, [buffer]);
  } catch (err) {
    self.postMessage({ ok: false, error: err.message });
  }
};
