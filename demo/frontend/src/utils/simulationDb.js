// ==========================================
// 시뮬레이션 시나리오 저장용 IndexedDB 유틸리티 (브라우저 로컬 전용, 백엔드 미사용)
// ==========================================
export const SIM_DB_NAME = 'SimulationDB';
export const SIM_STORE_NAME = 'scenarios';

export const initSimDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SIM_DB_NAME, 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(SIM_STORE_NAME)) {
        db.createObjectStore(SIM_STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

// 시나리오 저장 (신규 등록 / 기존 시나리오 덮어쓰기 겸용)
export const saveScenario = async (scenario) => {
  const db = await initSimDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SIM_STORE_NAME, 'readwrite');
    tx.objectStore(SIM_STORE_NAME).put(scenario);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

export const getAllScenarios = async () => {
  const db = await initSimDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SIM_STORE_NAME, 'readonly');
    const request = tx.objectStore(SIM_STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
};

export const deleteScenario = async (id) => {
  const db = await initSimDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SIM_STORE_NAME, 'readwrite');
    tx.objectStore(SIM_STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};
