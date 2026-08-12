// ==========================================
// IndexedDB 유틸리티 (브라우저 로컬 DB 설정)
// ==========================================
export const DB_NAME = 'MonitoringDB';
export const STORE_NAME = 'liveData';
// v2: equipId 인덱스 추가 (설비별 조회 시 전체 스캔 없이 바로 찾기 위함)
export const DB_VERSION = 2;

// DB 연결을 매번 새로 열면(open) 호출할 때마다 오버헤드가 커서(초당 여러 번 호출되는
// 실시간 저장/조회에서 특히 체감되는 렉의 원인이었음) 연결을 한 번만 열어서 재사용함
let dbPromise = null;

export const initDB = () => {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      const store = db.objectStoreNames.contains(STORE_NAME)
        ? e.target.transaction.objectStore(STORE_NAME)
        : db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      if (!store.indexNames.contains('equipId')) {
        store.createIndex('equipId', 'equipId', { unique: false });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      // 다른 탭에서 DB 버전이 바뀌는 등 연결이 끊기면 다음 호출에서 다시 열 수 있도록 캐시를 비움
      db.onclose = () => { dbPromise = null; };
      resolve(db);
    };
    request.onerror = () => { dbPromise = null; reject(request.error); };
  });
  return dbPromise;
};

export const saveToDB = async (dataArray) => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    const list = Array.isArray(dataArray) ? dataArray : [dataArray];
    list.forEach(item => store.put(item));

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

// 저장된 전체 건수만 확인 (전체 데이터를 읽지 않고 개수만 세므로, 데이터가 아무리 쌓여도 항상 빠름)
export const countFromDB = async () => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

// [startMs, endMs] 구간에 해당하는 데이터만 커서로 훑으며 골라냄
// (전체를 먼저 배열로 올리지 않고 조건에 맞는 것만 결과에 담아서,
//  누적량이 아무리 커도 최종적으로 메모리에 남는 건 실제 구간 안의 데이터뿐임)
export const getByDateRangeFromDB = async (startMs, endMs) => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const results = [];
    const request = store.openCursor();
    request.onsuccess = (e) => {
      const cursor = e.target.result;
      if (!cursor) {
        resolve(results);
        return;
      }
      const item = cursor.value;
      const itemMs = item.receivedAt ? new Date(item.receivedAt).getTime() : null;
      if (itemMs === null || (itemMs >= startMs && itemMs <= endMs)) {
        results.push(item);
      }
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });
};

// 특정 설비의 "최근 N건"만 조회 (equipId 인덱스로 바로 찾고, 뒤에서부터 커서로 필요한 개수만 읽어서
// 전체 데이터가 아무리 많이 쌓여도 항상 빠름 - 설비 클릭 시 뜨는 히스토리 차트에서 사용)
export const getRecentByEquipIdFromDB = async (equipId, limit = 80) => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('equipId');
    const results = [];
    const request = index.openCursor(IDBKeyRange.only(equipId), 'prev');
    request.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor && results.length < limit) {
        results.push(cursor.value);
        cursor.continue();
      } else {
        resolve(results.reverse()); // 과거 -> 최신 순으로 반환
      }
    };
    request.onerror = () => reject(request.error);
  });
};
