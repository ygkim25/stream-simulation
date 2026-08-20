// 내보내기 공통 유틸 - CSV 생성(행이 많으면 그 자체로 무거움)을 Web Worker에서 처리해서
// 메인 스레드(화면)가 그동안 멈추지 않게 함. XLSX로도 만들어봤는데 셀 서식까지 인코딩해야 해서
// 수만 행 규모에서 몇 초씩 걸렸고, 결국 열 너비 서식 정도는 포기하고 모든 내보내기를 CSV로
// 통일함 (같은 행 수도 텍스트를 이어붙이는 CSV가 훨씬 빠름).
// exportData는 호출부에서 이미 시트에 넣을 형태(평평한 행 객체 배열)로 다 조립해서 넘겨야 함 -
// 아직 안 조립된 원본 레코드를 그대로 워커에 보내는 방식도 시도해봤는데, 레코드가 많으면
// postMessage의 구조화 복제(structured clone) 비용이 계산 절감분보다 커서 오히려 더 느려졌음
// (조립은 메인 스레드에서, 워커는 인코딩만 담당하는 지금 구조가 더 빠름)

const escapeCsvCell = (value) => {
  if (value == null) return '';
  const s = String(value);
  return (s.includes(',') || s.includes('"') || s.includes('\n')) ? `"${s.replace(/"/g, '""')}"` : s;
};

const buildCsvText = (exportData, headers) => {
  const lines = [headers.join(',')];
  exportData.forEach(row => {
    lines.push(headers.map(h => escapeCsvCell(row[h])).join(','));
  });
  return '﻿' + lines.join('\n');
};

export const exportToCsv = (exportData, fileName) => {
  const outFileName = fileName.replace(/\.xlsx$/, '.csv');

  if (typeof Worker === 'undefined') {
    // 워커를 못 쓰는 환경이면 메인 스레드에서라도 동작하도록 폴백
    return new Promise((resolve, reject) => {
      try {
        const headers = exportData.length ? Object.keys(exportData[0]) : [];
        const blob = new Blob([buildCsvText(exportData, headers)], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = outFileName;
        a.click();
        URL.revokeObjectURL(url);
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }

  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/csvExportWorker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (msg) => {
      worker.terminate();
      if (!msg.data?.ok) {
        reject(new Error(msg.data?.error || 'CSV 파일 생성 실패'));
        return;
      }
      const blob = new Blob([msg.data.buffer], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = outFileName;
      a.click();
      URL.revokeObjectURL(url);
      resolve();
    };
    worker.onerror = (err) => {
      worker.terminate();
      reject(err);
    };
    worker.postMessage({ exportData });
  });
};
