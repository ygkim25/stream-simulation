import * as XLSX from 'xlsx';

// 엑셀 내보내기 공통 유틸 - 시트/워크북 생성 + 바이너리 인코딩(행이 많으면 꽤 무거움)을
// Web Worker에서 처리해서 메인 스레드(화면)가 그동안 멈추지 않게 함.
// exportData는 호출부에서 이미 시트에 넣을 형태(평평한 행 객체 배열)로 다 조립해서 넘겨야 함 -
// 아직 안 조립된 원본 레코드를 그대로 워커에 보내는 방식도 시도해봤는데, 레코드가 많으면
// postMessage의 구조화 복제(structured clone) 비용이 계산 절감분보다 커서 오히려 더 느려졌음
// (조립은 메인 스레드에서, 워커는 인코딩만 담당하는 지금 구조가 더 빠름)
export const exportToXlsx = (exportData, colWidths, fileName, sheetName) => {
  if (typeof Worker === 'undefined') {
    // 워커를 못 쓰는 환경이면 메인 스레드에서라도 동작하도록 폴백
    return new Promise((resolve, reject) => {
      try {
        const worksheet = XLSX.utils.json_to_sheet(exportData);
        if (colWidths) worksheet['!cols'] = colWidths;
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName || '시트1');
        XLSX.writeFile(workbook, fileName);
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }

  return new Promise((resolve, reject) => {
    console.time('[내보내기] 4a. 워커 생성+왕복(postMessage 포함)');
    const worker = new Worker(new URL('../workers/xlsxExportWorker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (msg) => {
      console.timeEnd('[내보내기] 4a. 워커 생성+왕복(postMessage 포함)');
      worker.terminate();
      if (!msg.data?.ok) {
        reject(new Error(msg.data?.error || '엑셀 파일 생성 실패'));
        return;
      }
      console.time('[내보내기] 4b. Blob 생성+다운로드 트리거');
      const blob = new Blob([msg.data.buffer], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      console.timeEnd('[내보내기] 4b. Blob 생성+다운로드 트리거');
      resolve();
    };
    worker.onerror = (err) => {
      worker.terminate();
      reject(err);
    };
    worker.postMessage({ exportData, colWidths, sheetName });
  });
};
