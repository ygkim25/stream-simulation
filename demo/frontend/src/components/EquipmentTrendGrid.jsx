import React, { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react';
import { ResponsiveContainer, AreaChart, Area } from 'recharts';
import { getRecentByEquipIdFromDB } from '../utils/indexedDb';
import { getStatusMeta } from '../utils/statusStyles';
import LoadingSpinner from './LoadingSpinner';

// 카드 하나당 표시할 최근 데이터 포인트 수 (많을수록 시간 흐름이 더 촘촘하게 보임)
const MAX_POINTS = 40;
// 아직 기록이 없는 설비의 기본값 - 매번 새 [] 리터럴을 주면 카드 memo가 매번 "달라졌다"고 오판함
const EMPTY_POINTS = [];
// IndexedDB 재조회 주기 - 큰 숫자/그래프 끝점은 이제 웹소켓 실시간 값으로 바로 그려지므로
// (그리드와 같이 움직임) 이 폴링은 "과거 추이 선"만 채우면 됨. 예전엔 이걸 1초로 당겨놨었는데,
// 그러면 설비마다 매초 IndexedDB를 동시 조회하게 돼서 다른 화면(카드 클릭 시 뜨는 큰 그래프
// 등)의 조회가 순서를 기다리느라 오히려 다 같이 느려짐 - 다시 여유있게 늘림
const REFRESH_MS = 4000;

// 새로고침 직후 빈 카드가 잠깐 보였다가 채워지지 않도록, 마지막 조회 결과를 로컬에 캐싱해둠
// (IndexedDB 조회는 비동기라 첫 페인트 전엔 못 끝나지만, localStorage는 동기라 초기값으로 바로 씀 -
// "전체 흐름"에 쓰던 것과 동일한 패턴)
const HISTORY_CACHE_KEY = 'equipmentTrendHistoryCache';
const loadCachedHistory = () => {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_CACHE_KEY)) || null;
  } catch {
    return null;
  }
};
const saveCachedHistory = (result) => {
  try {
    localStorage.setItem(HISTORY_CACHE_KEY, JSON.stringify(result));
  } catch {
    // localStorage를 못 쓰는 환경(프라이빗 모드 등)이면 캐싱 없이 그냥 조회 결과만 사용
  }
};

// 사용자가 직접 정한 카드 순서(설비ID 배열) - 백엔드 없이 이 브라우저에만 저장해두고,
// 다음에 다시 열었을 때도 그대로 이어서 보이게 함
const CARD_ORDER_KEY = 'equipmentTrendCardOrder';
const loadCardOrder = () => {
  try {
    const arr = JSON.parse(localStorage.getItem(CARD_ORDER_KEY));
    return Array.isArray(arr) ? arr : null;
  } catch {
    return null;
  }
};
const saveCardOrder = (order) => {
  try {
    localStorage.setItem(CARD_ORDER_KEY, JSON.stringify(order));
  } catch {
    // localStorage를 못 쓰는 환경이면 그냥 이번 세션 동안만(메모리) 순서가 유지됨
  }
};

const STATUS_COLOR = {
  green: { dark: '#34D399', light: '#22C55E' },
  amber: { dark: '#FBBF24', light: '#F59E0B' },
  red: { dark: '#FB5D75', light: '#EF4444' },
};

// 카드 하나를 독립된 컴포넌트로 분리하고 그 설비 값이 실제로 바뀐 경우에만 다시 그리게 함.
// (예전엔 부모 하나가 24개 카드를 통째로 map으로 그려서, 설비 1개만 값이 바뀌어도 24개
// AreaChart가 전부 다시 그려지며 계속 버벅였음)
const EquipTrendCard = memo(({ eq, basePoints, displayMetric, isDarkMode, onSelectEquip, hasLoadedHistoryOnce, unit, isReorderMode, isFirst, isLast, onMove }) => {
  // 큰 숫자/그래프 맨 끝 점은 IndexedDB 폴링 결과 대신 웹소켓으로 갓 들어온 실시간 값을
  // 바로 써서, 메인 그리드가 갱신되는 순간 이 카드도 같이 움직이게 함 (폴링 주기만큼
  // 뒤처져 "따로 논다"는 느낌이 들지 않도록)
  const liveValue = displayMetric === 'temperature' ? eq.temperature : eq.power;
  const points = liveValue != null ? [...basePoints, { value: liveValue }] : basePoints;
  const latest = points.length > 0 ? points[points.length - 1].value : null;

  // ▲▼ 델타는 폴링으로 채워진 basePoints의 마지막 값이 아니라, 이 카드가 실제로 마지막
  // 렌더링됐던 시점(=직전 실시간 틱)의 값과 비교함. basePoints 기준으로 비교하면 폴링
  // 주기(1초)와 실제 틱 타이밍이 어긋나서 몇 틱 전 값과 비교돼 화살표가 튀어 보였음.
  // 큰 숫자가 소수 첫째 자리까지만 보이므로, 그 반올림된 값 기준으로 비교해야 "숫자는 그대로인데
  // 화살표만 뜬다"는 위화감 없이 실제로 화면에 보이는 변화와 화살표가 항상 같이 움직임
  const roundedLatest = latest != null ? Number(Number(latest).toFixed(1)) : null;
  // 새로고침 직후엔 아직 실시간 틱이 한 번도 안 왔으니, 첫 비교 기준값을 캐시된 과거
  // 데이터(basePoints)의 마지막 값으로 미리 채워둠 - 그래야 카드마다 실시간 틱이 들어오는
  // 타이밍이 제각각이라 화살표가 하나씩 따로 뜨지 않고, 새로고침 시 다같이 한번에 뜸
  const [prevLive, setPrevLive] = useState(() => (
    basePoints.length > 0 ? basePoints[basePoints.length - 1].value : null
  ));
  const rawDelta = roundedLatest != null && prevLive != null ? roundedLatest - prevLive : null;
  useEffect(() => {
    if (roundedLatest != null) setPrevLive(roundedLatest);
  }, [roundedLatest]);
  // 값이 안 바뀐 틱에는 방향이 0으로 리셋되어 화살표가 깜빡였다 사라졌다 했음 - 새로 방향이
  // 생길 때만 갱신하고, 그 사이엔 마지막으로 감지된 방향을 계속 띄워둠
  const [delta, setDelta] = useState(null);
  useEffect(() => {
    if (rawDelta) setDelta(rawDelta);
  }, [rawDelta]);
  const statusColor = getStatusMeta(displayMetric === 'temperature' ? eq.status : eq.powerStatus).color;
  const color = STATUS_COLOR[statusColor][isDarkMode ? 'dark' : 'light'];
  const gradientId = `spark-grad-${eq.equipId}-${displayMetric}`;
  const glowId = `spark-glow-${eq.equipId}-${displayMetric}`;

  return (
    <div
      onClick={isReorderMode ? undefined : () => onSelectEquip?.(eq.equipId, displayMetric)}
      title={isReorderMode ? undefined : '클릭하면 자세히 보기'}
      className={`group relative rounded-xl border overflow-hidden transition-all duration-300 ${isReorderMode ? '' : 'cursor-pointer hover:shadow-lg hover:-translate-y-0.5'} ${
        isDarkMode
          ? 'border-[#1E253D] hover:border-[#2A335A]'
          : 'border-gray-200 hover:border-gray-300 shadow-sm'
      }`}
      style={{
        background: isDarkMode
          ? 'linear-gradient(160deg, #121A33 0%, #0C1122 100%)'
          : 'linear-gradient(160deg, #FFFFFF 0%, #F7F9FC 100%)',
      }}
    >
      {/* 상태 컬러 액센트 바 */}
      <div className="absolute top-0 left-0 right-0 h-[2.5px]" style={{ backgroundColor: color, opacity: 0.85 }} />

      {/* 순서 변경 모드: 카드 본문 클릭(상세보기)은 막되, 오른쪽 위에 배경 없이 화살표만 살짝 얹어둠 */}
      {isReorderMode && (
        <div className="absolute top-1 right-1 z-20 flex items-center gap-0.5">
          <button
            type="button"
            disabled={isFirst}
            onClick={(e) => { e.stopPropagation(); onMove(eq.equipId, -1); }}
            className={`text-[10px] font-bold leading-none transition-colors ${
              isFirst
                ? (isDarkMode ? 'text-[#3A4266] cursor-not-allowed' : 'text-gray-300 cursor-not-allowed')
                : (isDarkMode ? 'text-[#9FACC9] hover:text-[#EDF1FC] cursor-pointer' : 'text-gray-400 hover:text-gray-800 cursor-pointer')
            }`}
          >
            ◀
          </button>
          <button
            type="button"
            disabled={isLast}
            onClick={(e) => { e.stopPropagation(); onMove(eq.equipId, 1); }}
            className={`text-[10px] font-bold leading-none transition-colors ${
              isLast
                ? (isDarkMode ? 'text-[#3A4266] cursor-not-allowed' : 'text-gray-300 cursor-not-allowed')
                : (isDarkMode ? 'text-[#9FACC9] hover:text-[#EDF1FC] cursor-pointer' : 'text-gray-400 hover:text-gray-800 cursor-pointer')
            }`}
          >
            ▶
          </button>
        </div>
      )}

      <div className="px-2.5 pt-2 pb-1.5">
        <div className="flex items-center justify-between gap-1 mb-0.5">
          <span className={`truncate text-[11px] font-semibold tracking-tight ${isDarkMode ? 'text-[#DCE2F5]' : 'text-gray-700'}`} title={eq.equipName}>
            {eq.equipName}
          </span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-[15px] font-bold font-mono tabular-nums" style={{ color }}>
            {latest != null ? Number(latest).toFixed(1) : '–'}
          </span>
          <span className={`text-[10px] font-mono ${isDarkMode ? 'text-[#5C6584]' : 'text-gray-400'}`}>{unit}</span>
          {delta != null && delta !== 0 && (
            <span className={`text-[10px] font-mono font-bold ml-auto ${
              delta > 0
                ? (isDarkMode ? 'text-[#FB5D75]' : 'text-red-500')
                : (isDarkMode ? 'text-[#38BDF8]' : 'text-blue-500')
            }`}>
              {delta > 0 ? '▲' : '▼'}{Math.abs(delta).toFixed(1)}
            </span>
          )}
        </div>
      </div>

      <div style={{ height: 42 }} className="px-0.5 pb-0.5">
        {!hasLoadedHistoryOnce ? (
          <div className="h-full flex items-center justify-center">
            <LoadingSpinner size="sm" isDarkMode={isDarkMode} />
          </div>
        ) : points.length > 1 ? (
          // initialDimension을 안 주면 ResponsiveContainer가 ResizeObserver로 실제 크기를
          // 잴 때까지 아무것도 안 그리는데, 카드가 한꺼번에 12개 넘게 마운트되면 이 측정
          // 콜백들이 프레임마다 조금씩 흩어져서 카드가 하나씩 순차적으로 나타나는 것처럼
          // 보였음. 대략적인 크기를 미리 줘서 첫 페인트부터 바로 그려지게 함
          <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 140, height: 42 }}>
            <AreaChart data={points} margin={{ top: 2, right: 4, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
                {isDarkMode && (
                  <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="1.6" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                )}
              </defs>
              <Area
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={1.75}
                fill={`url(#${gradientId})`}
                dot={false}
                isAnimationActive={false}
                style={isDarkMode ? { filter: `url(#${glowId})` } : undefined}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className={`h-full flex items-center justify-center text-[10px] ${isDarkMode ? 'text-[#5C6584]' : 'text-gray-400'}`}>
            수집 중...
          </div>
        )}
      </div>
    </div>
  );
}, (prev, next) => {
  if (prev.isDarkMode !== next.isDarkMode) return false;
  if (prev.displayMetric !== next.displayMetric) return false;
  if (prev.hasLoadedHistoryOnce !== next.hasLoadedHistoryOnce) return false;
  if (prev.basePoints !== next.basePoints) return false;
  if (prev.isReorderMode !== next.isReorderMode) return false;
  if (prev.isFirst !== next.isFirst) return false;
  if (prev.isLast !== next.isLast) return false;
  const valueKey = next.displayMetric === 'temperature' ? 'temperature' : 'power';
  const statusKey = next.displayMetric === 'temperature' ? 'status' : 'powerStatus';
  if (prev.eq[valueKey] !== next.eq[valueKey]) return false;
  if (prev.eq[statusKey] !== next.eq[statusKey]) return false;
  if (prev.eq.equipName !== next.eq.equipName) return false;
  return true;
});

// ==========================================
// 설비별 미니 추이 카드 그리드
// 설비마다 최근 흐름을 라인 형태로 보여줘서 "시간에 따른 변화"가 한눈에 보이게 함
// (그리드 우측 상단, IndexedDB에 누적된 실시간 데이터 사용, 백엔드 미사용)
// ==========================================
// metric('temperature' | 'power')은 실시간 모니터링 그리드 상단 탭과 공유되는 값이라 부모에서 내려받음
// (예전엔 이 컴포넌트가 자체 토글을 따로 갖고 있었는데, 그리드/알람 탭이랑 따로 놀아서 헷갈린다는
// 피드백으로 그리드의 탭 하나로 통일함)
const EquipmentTrendGrid = ({ equipments, isDarkMode, onSelectEquip, statusCounts, metric }) => {
  // equipId -> 시간순 정렬된 최근 데이터 배열 (캐시가 있으면 새로고침 직후에도 곧바로 채워진 상태로 시작)
  const [historyMap, setHistoryMap] = useState(() => loadCachedHistory() || {});
  // 첫 조회가 끝나기 전까지는 "데이터가 확실히 부족함"과 구분해서 로딩 표시를 해줌
  const [hasLoadedHistoryOnce, setHasLoadedHistoryOnce] = useState(() => loadCachedHistory() !== null);

  // 카드 순서를 직접 바꾸는 모드 (설정 버튼으로 토글) + 사용자가 정한 순서(없으면 기본 정렬 사용)
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [customOrder, setCustomOrder] = useState(() => loadCardOrder());

  // 카드가 많으면(설비 수만큼 recharts 인스턴스가 동시에 다시 그려짐) 탭 전환 시 눈에 띄게 버벅이는데,
  // 그 렌더링이 끝날 때까지 그냥 화면이 멈춘 것처럼 보이는 문제가 있었음. metric이 바뀌면 일단
  // 로딩 표시부터 그려지도록 한 프레임 양보한 뒤에 실제(무거운) 차트 전환을 함
  const [displayMetric, setDisplayMetric] = useState(metric);
  const [isMetricPending, setIsMetricPending] = useState(false);
  useEffect(() => {
    if (metric === displayMetric) return undefined;
    setIsMetricPending(true);
    const rafId = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setDisplayMetric(metric);
        setIsMetricPending(false);
      });
    });
    return () => cancelAnimationFrame(rafId);
  }, [metric, displayMetric]);

  // 매 조회 시점의 최신 설비 목록을 참조하기 위한 ref (interval을 재시작하지 않고도 최신 목록을 반영)
  const equipIdsRef = useRef([]);
  useEffect(() => {
    equipIdsRef.current = equipments.map(eq => eq.equipId);
  }, [equipments]);

  // load()가 클로저로 갇힌 옛 historyMap을 안 보고 항상 최신값을 보도록 ref로 미러링
  const historyMapRef = useRef(historyMap);
  useEffect(() => {
    historyMapRef.current = historyMap;
  }, [historyMap]);

  // 마운트 시점엔 설비 목록이 아직 안 온 경우가 많아서(REST 조회가 끝나기 전) 예전엔 첫 조회가 그냥
  // 빈 목록으로 건너뛰어지고, 다음 REFRESH_MS(4초) 주기까지 기다려야 카드가 채워졌음. 목록이 실제로
  // 채워지는 시점에 맞춰 바로 첫 조회가 실행되도록 이 시점을 deps로 잡음
  const hasEquipIds = equipments.length > 0;
  useEffect(() => {
    if (!hasEquipIds) return;
    let cancelled = false;
    const load = async () => {
      const ids = equipIdsRef.current;
      if (ids.length === 0) return;
      try {
        // equipId 인덱스로 설비별 최근 데이터만 바로 조회 (전체 스캔 없이 항상 빠름)
        const results = await Promise.all(ids.map(id => getRecentByEquipIdFromDB(id, MAX_POINTS)));
        if (cancelled) return;
        // 내용이 그대로인 설비는 이전 배열 참조를 그대로 재사용함 - 매번 새 객체를 만들면 카드별
        // memo가 무의미해져서 폴링(1초)마다 카드 24개가 전부 다시 그려지며 버벅였음
        const prevMap = historyMapRef.current;
        const grouped = {};
        ids.forEach((id, i) => {
          const fresh = results[i];
          const cached = prevMap[id];
          const last = fresh[fresh.length - 1];
          const cachedLast = cached?.[cached.length - 1];
          const unchanged = cached && cached.length === fresh.length
            && (last?.receivedAtMs ?? null) === (cachedLast?.receivedAtMs ?? null);
          grouped[id] = unchanged ? cached : fresh;
        });
        setHistoryMap(grouped);
        setHasLoadedHistoryOnce(true);
        saveCachedHistory(grouped);
      } catch (e) {
        console.error('설비 추이 조회 실패:', e);
      }
    };
    load();
    const intervalId = setInterval(load, REFRESH_MS);
    return () => { cancelled = true; clearInterval(intervalId); };
  }, [hasEquipIds]);

  const defaultSortedEquipments = [...equipments].sort((a, b) => {
    const aNum = Number(a.equipId);
    const bNum = Number(b.equipId);
    if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) return aNum - bNum;
    return String(a.equipId).localeCompare(String(b.equipId));
  });
  // 사용자가 순서를 정해둔 적이 있으면 그 순서를 우선 적용함. 아직 순서가 없던(=새로 추가된)
  // 설비는 Infinity로 밀려서 sort가 안정 정렬이라 defaultSortedEquipments 순서 그대로 맨 뒤에 붙음
  const sortedEquipments = useMemo(() => {
    if (!customOrder || customOrder.length === 0) return defaultSortedEquipments;
    const orderIndex = new Map(customOrder.map((id, i) => [id, i]));
    return [...defaultSortedEquipments].sort((a, b) => {
      const ai = orderIndex.has(a.equipId) ? orderIndex.get(a.equipId) : Infinity;
      const bi = orderIndex.has(b.equipId) ? orderIndex.get(b.equipId) : Infinity;
      return ai - bi;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipments, customOrder]);

  // moveCard가 항상 최신 sortedEquipments를 보도록 ref로 미러링 (핸들러 자체는 useCallback으로
  // 고정해서 EquipTrendCard의 memo가 매 렌더 새 함수 때문에 깨지지 않게 함)
  const sortedEquipmentsRef = useRef(sortedEquipments);
  useEffect(() => {
    sortedEquipmentsRef.current = sortedEquipments;
  }, [sortedEquipments]);

  const handleMoveCard = useCallback((equipId, direction) => {
    setCustomOrder(prev => {
      const base = prev && prev.length > 0 ? prev : sortedEquipmentsRef.current.map(eq => eq.equipId);
      const idx = base.indexOf(equipId);
      if (idx === -1) return prev;
      const targetIdx = idx + direction;
      if (targetIdx < 0 || targetIdx >= base.length) return prev;
      const next = [...base];
      [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
      saveCardOrder(next);
      return next;
    });
  }, []);

  // equipId -> basePoints. historyMap/displayMetric이 바뀔 때만(=폴링될 때만) 다시 계산하고,
  // 그 사이 설비 값이 실시간으로 바뀌어 부모가 리렌더링돼도 이전 배열 참조를 그대로 씀 - 그래야
  // 안 바뀐 설비의 EquipTrendCard가 "새 배열이라 다르다"고 오판해 다시 그려지지 않음
  const basePointsByEquip = useMemo(() => {
    const map = new Map();
    Object.keys(historyMap).forEach(equipId => {
      const basePoints = (historyMap[equipId] || [])
        .map(item => ({ value: displayMetric === 'temperature' ? item.temperature : item.power }))
        .filter(p => p.value != null);
      map.set(equipId, basePoints);
    });
    return map;
  }, [historyMap, displayMetric]);

  const unit = displayMetric === 'temperature' ? '℃' : '';
  const dotColor = displayMetric === 'temperature'
    ? (isDarkMode ? 'bg-[#FB5D75]' : 'bg-red-500')
    : (isDarkMode ? 'bg-[#22D3EE]' : 'bg-green-600');

  return (
    <div className={`w-full h-full rounded-xl p-3.5 border transition-colors flex flex-col min-h-0 overflow-hidden ${
      isDarkMode ? 'bg-[#12172A] border-[#1E253D]' : 'bg-white border-gray-200 shadow-sm'
    }`}>
      <div className="flex items-center gap-2 mb-2.5 shrink-0">
        <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
        <span className={`text-[15px] font-bold truncate ${isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-800'}`}>
          설비별 {displayMetric === 'temperature' ? '온도' : '전력'} 추이
        </span>
        <button
          type="button"
          onClick={() => setIsReorderMode(v => !v)}
          title={isReorderMode ? '순서 변경 완료' : '카드 순서 변경'}
          className={`ml-auto shrink-0 p-1.5 rounded-lg transition-colors ${
            isReorderMode
              ? (isDarkMode ? 'bg-[#22D3EE]/20 text-[#22D3EE]' : 'bg-green-100 text-green-700')
              : (isDarkMode ? 'text-[#5C6584] hover:text-[#EDF1FC] hover:bg-[#1A2036]' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100')
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>
      {isReorderMode && (
        <div className={`mb-2 -mt-1 text-[11px] shrink-0 ${isDarkMode ? 'text-[#7D87A8]' : 'text-gray-400'}`}>
          카드의 ▲▼ 버튼으로 순서를 바꿀 수 있어요. 정한 순서는 이 브라우저에 저장돼서 다음에 열어도 유지됩니다.
        </div>
      )}

      {sortedEquipments.length === 0 ? (
        <div className={`flex-1 min-h-0 flex items-center justify-center text-xs ${isDarkMode ? 'text-[#5C6584]' : 'text-gray-400'}`}>
          데이터 없음
        </div>
      ) : (
        <div className="relative flex-1 min-h-0 overflow-y-auto custom-scrollbar">
          {isMetricPending && (
            <div className={`absolute inset-0 z-10 flex items-center justify-center ${isDarkMode ? 'bg-[#12172A]/80' : 'bg-white/80'}`}>
              <LoadingSpinner size="md" isDarkMode={isDarkMode} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2.5 pr-1 pb-1">
            {sortedEquipments.map((eq, i) => {
              return (
                <EquipTrendCard
                  key={eq.equipId}
                  eq={eq}
                  basePoints={basePointsByEquip.get(eq.equipId) || EMPTY_POINTS}
                  displayMetric={displayMetric}
                  isDarkMode={isDarkMode}
                  onSelectEquip={onSelectEquip}
                  hasLoadedHistoryOnce={hasLoadedHistoryOnce}
                  unit={unit}
                  isReorderMode={isReorderMode}
                  isFirst={i === 0}
                  isLast={i === sortedEquipments.length - 1}
                  onMove={handleMoveCard}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* 정상/경고/위험 요약 (statusCounts가 전달된 경우에만 표시 - 일반 사용자용, 알람 패널 하단과 동일한 모양) */}
      {statusCounts && (
        <div className={`-mx-3.5 -mb-3.5 mt-3.5 px-3 py-3 border-t flex justify-end gap-2 text-[11px] shrink-0 transition-colors ${
          isDarkMode ? 'bg-[#0F1526] border-[#1E253D]' : 'bg-gray-50 border-gray-200'
        }`}>
          <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono font-bold ${
            isDarkMode ? 'bg-[#34D399]/10 text-[#34D399]' : 'bg-green-50 text-green-700 border border-green-200'
          }`}>
            <span className="status-dot bg-green-500" />
            정상 {statusCounts.normal}
          </span>
          <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono font-bold ${
            isDarkMode ? 'bg-[#FBBF24]/10 text-[#FBBF24]' : 'bg-amber-50 text-amber-700 border border-amber-200'
          }`}>
            <span className="status-dot bg-amber-500" />
            경고 {statusCounts.warning}
          </span>
          <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono font-bold ${
            isDarkMode ? 'bg-[#FB5D75]/10 text-[#FB5D75]' : 'bg-red-50 text-red-600 border border-red-200'
          }`}>
            <span className="status-dot bg-red-500" />
            위험 {statusCounts.danger}
          </span>
        </div>
      )}
    </div>
  );
};

// equipments는 웹소켓 틱마다 새 배열로 갱신되는데, 안 바뀐 설비는 객체 참조가 그대로라
// id/이름/상태/현재 지표 값이 실제로 바뀐 경우에만 리렌더링함 (그래야 이 카드들의 숫자/그래프가
// 폴링 주기가 아니라 메인 그리드와 같은 타이밍에 움직임 - 값 자체는 비교 대상에서 뺐던 예전 방식은
// 카드가 그리드보다 한 박자씩 늦게 움직이는 문제가 있었음)
const areEqual = (prev, next) => {
  if (prev.isDarkMode !== next.isDarkMode) return false;
  if (prev.metric !== next.metric) return false;
  if (prev.equipments.length !== next.equipments.length) return false;
  const valueKey = next.metric === 'temperature' ? 'temperature' : 'power';
  for (let i = 0; i < prev.equipments.length; i++) {
    const a = prev.equipments[i];
    const b = next.equipments[i];
    if (a.equipId !== b.equipId || a.equipName !== b.equipName || a.status !== b.status || a.powerStatus !== b.powerStatus) return false;
    if (a[valueKey] !== b[valueKey]) return false;
  }
  return true;
};

export default memo(EquipmentTrendGrid, areEqual);
