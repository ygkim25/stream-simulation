// ==========================================
// IndexedDB 유틸리티 (브라우저 로컬 DB 설정)
// ==========================================
export const DB_NAME = 'MonitoringDB';
export const STORE_NAME = 'liveData';
// v2: equipId 인덱스 추가 (설비별 조회 시 전체 스캔 없이 바로 찾기 위함)
// v3: receivedAtMs(숫자 타임스탬프) 인덱스 추가 (전체 흐름이 5초마다 구간 조회를 하는데,
//     인덱스 없이 매번 저장소 전체를 훑다 보니 데이터가 쌓일수록 눈에 띄게 느려졌음)
// v4: receivedAtMs가 없는 기존 레코드들을 채워 넣는 백필 추가 (아래 backfillReceivedAtMsIfNeeded 참고)
export const DB_VERSION = 4;

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
      if (!store.indexNames.contains('receivedAtMs')) {
        store.createIndex('receivedAtMs', 'receivedAtMs', { unique: false });
      }
      // 예전 레코드 백필은 여기서 하지 않음 - 레코드가 많으면 업그레이드 트랜잭션이 끝날 때까지
      // initDB() 자체가 멈춰서(설비별 온도추이/전체 흐름 등 모든 IndexedDB 조회가) 한동안 아무것도
      // 안 뜨는 문제가 있었음. 대신 DB가 열린 뒤 별도 트랜잭션으로 백그라운드에서 채움.
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

// receivedAtMs 인덱스 도입(v3) 이전에 저장된 레코드들은 이 필드가 없어서 인덱스 조회에 안 걸림.
// DB open을 막지 않도록 별도 트랜잭션으로, 딱 한 번만(로컬스토리지 플래그) 백그라운드에서 채워 넣음.
const BACKFILL_DONE_KEY = 'monitoringDbReceivedAtMsBackfillDone';
let backfillPromise = null;

export const backfillReceivedAtMsIfNeeded = () => {
  if (backfillPromise) return backfillPromise;
  let alreadyDone = false;
  try {
    alreadyDone = localStorage.getItem(BACKFILL_DONE_KEY) === '1';
  } catch {
    // localStorage를 못 쓰는 환경이면 매번 다시 시도 (idempotent라 안전함)
  }
  if (alreadyDone) return Promise.resolve();

  backfillPromise = (async () => {
    const db = await initDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.openCursor();
      request.onsuccess = (e) => {
        const cursor = e.target.result;
        if (!cursor) { resolve(); return; }
        const item = cursor.value;
        if (item.receivedAtMs === undefined && item.receivedAt) {
          cursor.update({ ...item, receivedAtMs: new Date(item.receivedAt).getTime() });
        }
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
    try { localStorage.setItem(BACKFILL_DONE_KEY, '1'); } catch { /* ignore */ }
  })();
  return backfillPromise;
};

export const saveToDB = async (dataArray) => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    const list = Array.isArray(dataArray) ? dataArray : [dataArray];
    // receivedAtMs(숫자)를 미리 계산해서 같이 저장해두면, 구간 조회 시 문자열 파싱 없이
    // receivedAtMs 인덱스로 바로 범위 검색을 할 수 있음
    list.forEach(item => {
      const receivedAtMs = item.receivedAt ? new Date(item.receivedAt).getTime() : undefined;
      store.put(receivedAtMs !== undefined ? { ...item, receivedAtMs } : item);
    });

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

// [startMs, endMs] 구간을 receivedAtMs 인덱스로 바로 검색함 (위 getByDateRangeFromDB와 달리
// 저장소 전체를 훑지 않고 구간에 해당하는 레코드만 커서가 지나가므로, 데이터가 많이 쌓여도
// 항상 "구간 크기"에 비례하는 속도로 빠름 - "전체 흐름"처럼 짧은 주기로 반복 조회하는 곳에서 사용)
export const getByDateRangeIndexedFromDB = async (startMs, endMs) => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('receivedAtMs');
    const results = [];
    const request = index.openCursor(IDBKeyRange.bound(startMs, endMs));
    request.onsuccess = (e) => {
      const cursor = e.target.result;
      if (!cursor) {
        resolve(results);
        return;
      }
      results.push(cursor.value);
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });
};

// cutoffMs보다 오래된 레코드를 지워서 저장소 크기를 계속 작게 유지함 (저장소가 무한정 커지면
// 위의 스캔 기반 조회들이 갈수록 느려짐). id는 저장 순서라 시간순과 거의 일치하므로 오름차순
// (과거->최신)으로 훑다가 cutoff를 넘는 첫 레코드를 만나면 그 뒤는 전부 최신이라 바로 중단함
export const pruneOldRecordsFromDB = async (cutoffMs) => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    let deletedCount = 0;
    const request = store.openCursor();
    request.onsuccess = (e) => {
      const cursor = e.target.result;
      if (!cursor) {
        resolve(deletedCount);
        return;
      }
      const item = cursor.value;
      const itemMs = item.receivedAt ? new Date(item.receivedAt).getTime() : null;
      if (itemMs === null) {
        // 시간 정보가 없는 레코드는 판단할 수 없으니 건너뜀
        cursor.continue();
      } else if (itemMs < cutoffMs) {
        cursor.delete();
        deletedCount += 1;
        cursor.continue();
      } else {
        resolve(deletedCount);
      }
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
