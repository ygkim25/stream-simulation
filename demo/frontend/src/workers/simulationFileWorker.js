import { parseWorkbookBuffer } from '../utils/simulationParse';

// 메인 스레드에서 File을 ArrayBuffer로 읽은 뒤 전송(transfer)해주면, 여기서 XLSX 파싱 +
// 행 변환처럼 무거운 CPU 작업을 처리하고 결과만 돌려줌
self.onmessage = (e) => {
  try {
    const result = parseWorkbookBuffer(e.data);
    self.postMessage({ ok: true, result });
  } catch (err) {
    self.postMessage({ ok: false, error: err.message });
  }
};
