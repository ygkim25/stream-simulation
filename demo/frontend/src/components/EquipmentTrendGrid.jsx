import React, { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react';
import { ResponsiveContainer, AreaChart, Area } from 'recharts';
import { getRecentByEquipIdFromDB } from '../utils/indexedDb';
import { getStatusMeta } from '../utils/statusStyles';
import LoadingSpinner from './LoadingSpinner';

// 카드 하나당 표시할 최근 데이터 포인트 수 (많을수록 시간 흐름이 더 촘촘하게 보임)
const MAX_POINTS = 40;
// 아직 기록이 없는 설비의 기본값 - 매번 새 [] 리터럴을 주면 카드 memo가 매번 "달라졌다"고 오판함
const EMPTY_POINTS = [];
// IndexedDB 재조회 주기 - 과거 추이 선만 채우면 되므로 여유있게 잡음
const REFRESH_MS = 4000;

// 새로고침 직후 빈 카드 방지용 캐시 (localStorage는 동기라 초기값으로 바로 씀)
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
  } catch { /* 캐시 없이 진행 */ }
};

// 사용자가 정한 카드 순서 (브라우저에만 저장)
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
  } catch { /* 세션 메모리로만 유지 */ }
};

const STATUS_COLOR = {
  green: { dark: '#34D399', light: '#22C55E' },
  amber: { dark: '#FBBF24', light: '#F59E0B' },
  red: { dark: '#FB5D75', light: '#EF4444' },
};

// 카드를 독립 컴포넌트로 분리해 값이 바뀐 카드만 리렌더링
const EquipTrendCard = memo(({ eq, basePoints, displayMetric, isDarkMode, onSelectEquip, hasLoadedHistoryOnce, unit, isReorderMode, isDragging, isDragOver, onDragStart, onDragEnter, onDrop, onDragEnd }) => {
  // 끝 점은 IndexedDB 폴링 대신 웹소켓 실시간 값을 바로 써서 메인 그리드와 같이 움직임
  const liveValue = displayMetric === 'temperature' ? eq.temperature : eq.power;
  const points = liveValue != null ? [...basePoints, { value: liveValue }] : basePoints;
  const latest = points.length > 0 ? points[points.length - 1].value : null;

  // ▲▼ 델타는 화면에 보이는 반올림 값(직전 렌더 시점) 기준으로 계산
  const roundedLatest = latest != null ? Number(Number(latest).toFixed(1)) : null;
  const [prevLive, setPrevLive] = useState(() => (
    basePoints.length > 0 ? basePoints[basePoints.length - 1].value : null
  ));
  const rawDelta = roundedLatest != null && prevLive != null ? roundedLatest - prevLive : null;
  useEffect(() => {
    if (roundedLatest != null) setPrevLive(roundedLatest);
  }, [roundedLatest]);
  // 새로 방향이 생길 때만 갱신 (0으로 리셋되어 깜빡이는 것 방지)
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
      draggable={isReorderMode}
      onDragStart={(e) => {
        if (!isReorderMode) return;
        e.dataTransfer.effectAllowed = 'move';
        onDragStart(eq.equipId);
      }}
      onDragEnter={(e) => {
        if (!isReorderMode) return;
        e.preventDefault();
        onDragEnter(eq.equipId);
      }}
      onDragOver={(e) => {
        if (!isReorderMode) return;
        e.preventDefault(); // 이걸 안 하면 이 요소 위에서 onDrop 자체가 안 일어남
      }}
      onDrop={(e) => {
        if (!isReorderMode) return;
        e.preventDefault();
        onDrop(eq.equipId);
      }}
      onDragEnd={() => { if (isReorderMode) onDragEnd(); }}
      onClick={isReorderMode ? undefined : () => onSelectEquip?.(eq.equipId, displayMetric)}
      title={isReorderMode ? '드래그해서 순서 변경' : '클릭하면 자세히 보기'}
      className={`group relative rounded-xl border overflow-hidden transition-all duration-300 ${
        isReorderMode ? 'cursor-move' : 'cursor-pointer hover:shadow-lg hover:-translate-y-0.5'
      } ${isDragging ? 'opacity-40' : ''} ${
        isDragOver
          ? (isDarkMode ? 'border-[#22D3EE]' : 'border-green-500')
          : (isDarkMode ? 'border-[#1E253D] hover:border-[#2A335A]' : 'border-gray-200 hover:border-gray-300 shadow-sm')
      }`}
      style={{
        background: isDarkMode
          ? 'linear-gradient(160deg, #121A33 0%, #0C1122 100%)'
          : 'linear-gradient(160deg, #FFFFFF 0%, #F7F9FC 100%)',
      }}
    >
      {/* 상태 컬러 액센트 바 */}
      <div className="absolute top-0 left-0 right-0 h-[2.5px]" style={{ backgroundColor: color, opacity: 0.85 }} />

      {/* 순서 변경 모드: 드래그 가능하다는 걸 알려주는 그립 아이콘 (배경 없이 살짝 얹어둠) */}
      {isReorderMode && (
        <div className={`absolute top-1 right-1 z-20 ${isDarkMode ? 'text-[#5C6584]' : 'text-gray-300'}`}>
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <circle cx="6" cy="5" r="1.3" /><circle cx="14" cy="5" r="1.3" />
            <circle cx="6" cy="10" r="1.3" /><circle cx="14" cy="10" r="1.3" />
            <circle cx="6" cy="15" r="1.3" /><circle cx="14" cy="15" r="1.3" />
          </svg>
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
          // initialDimension으로 크기 측정 전에도 바로 그려지게 함 (카드 순차 등장 방지)
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
  if (prev.isDragging !== next.isDragging) return false;
  if (prev.isDragOver !== next.isDragOver) return false;
  const valueKey = next.displayMetric === 'temperature' ? 'temperature' : 'power';
  const statusKey = next.displayMetric === 'temperature' ? 'status' : 'powerStatus';
  if (prev.eq[valueKey] !== next.eq[valueKey]) return false;
  if (prev.eq[statusKey] !== next.eq[statusKey]) return false;
  if (prev.eq.equipName !== next.eq.equipName) return false;
  return true;
});

// ==========================================
// 설비별 미니 추이 카드 그리드 - IndexedDB 누적 데이터로 최근 흐름을 라인으로 보여줌
// ==========================================
// metric은 실시간 모니터링 그리드 상단 탭과 공유되는 값(부모에서 내려받음)
const EquipmentTrendGrid = ({ equipments, isDarkMode, onSelectEquip, statusCounts, metric }) => {
  const [historyMap, setHistoryMap] = useState(() => loadCachedHistory() || {});
  const [hasLoadedHistoryOnce, setHasLoadedHistoryOnce] = useState(() => loadCachedHistory() !== null);

  // 카드 순서 변경 모드 + 사용자가 정한 순서(없으면 기본 정렬)
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [customOrder, setCustomOrder] = useState(() => loadCardOrder());

  // metric 전환 시 로딩 표시부터 그린 뒤 한 프레임 양보하고 무거운 차트 전환
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

  // interval 재시작 없이 최신 설비 목록을 참조하기 위한 ref
  const equipIdsRef = useRef([]);
  useEffect(() => {
    equipIdsRef.current = equipments.map(eq => eq.equipId);
  }, [equipments]);

  // load()가 항상 최신 historyMap을 보도록 ref로 미러링
  const historyMapRef = useRef(historyMap);
  useEffect(() => {
    historyMapRef.current = historyMap;
  }, [historyMap]);

  // 설비 목록이 채워지는 시점에 맞춰 바로 첫 조회 실행
  const hasEquipIds = equipments.length > 0;
  useEffect(() => {
    if (!hasEquipIds) return;
    let cancelled = false;
    const load = async () => {
      const ids = equipIdsRef.current;
      if (ids.length === 0) return;
      try {
        const results = await Promise.all(ids.map(id => getRecentByEquipIdFromDB(id, MAX_POINTS)));
        if (cancelled) return;
        // 내용이 그대로인 설비는 이전 배열 참조를 재사용해 카드 memo 유지
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
  // 순서가 없던 설비는 Infinity로 밀려서 기본 정렬 순서 그대로 맨 뒤에 붙음
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

  // 핸들러 참조를 useCallback으로 고정하기 위해 최신 목록은 ref로 미러링
  const sortedEquipmentsRef = useRef(sortedEquipments);
  useEffect(() => {
    sortedEquipmentsRef.current = sortedEquipments;
  }, [sortedEquipments]);

  // 드래그로 순서 변경 - 핸들러 참조 고정을 위해 state와 별도로 ref도 유지
  const draggedIdRef = useRef(null);
  const [draggedId, setDraggedId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

  const handleDragStart = useCallback((equipId) => {
    draggedIdRef.current = equipId;
    setDraggedId(equipId);
  }, []);

  const handleDragEnter = useCallback((equipId) => {
    if (draggedIdRef.current && draggedIdRef.current !== equipId) setDragOverId(equipId);
  }, []);

  // 드롭한 카드가 있던 자리에 드래그하던 카드를 끼워넣음 (사이 카드들은 자연스럽게 한 칸씩 밀림)
  const handleDrop = useCallback((targetEquipId) => {
    const sourceId = draggedIdRef.current;
    if (sourceId && sourceId !== targetEquipId) {
      setCustomOrder(prev => {
        const base = prev && prev.length > 0 ? prev : sortedEquipmentsRef.current.map(eq => eq.equipId);
        const fromIdx = base.indexOf(sourceId);
        const toIdx = base.indexOf(targetEquipId);
        if (fromIdx === -1 || toIdx === -1) return prev;
        const next = [...base];
        next.splice(fromIdx, 1);
        next.splice(toIdx, 0, sourceId);
        saveCardOrder(next);
        return next;
      });
    }
    draggedIdRef.current = null;
    setDraggedId(null);
    setDragOverId(null);
  }, []);

  const handleDragEnd = useCallback(() => {
    draggedIdRef.current = null;
    setDraggedId(null);
    setDragOverId(null);
  }, []);

  // historyMap/displayMetric 변경 시에만 재계산 (부모 리렌더링에 영향 안 받도록)
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
            {sortedEquipments.map((eq) => {
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
                  isDragging={eq.equipId === draggedId}
                  isDragOver={eq.equipId === dragOverId}
                  onDragStart={handleDragStart}
                  onDragEnter={handleDragEnter}
                  onDrop={handleDrop}
                  onDragEnd={handleDragEnd}
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
          <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono font-bold border ${
            isDarkMode ? 'bg-[#34D399]/10 text-[#34D399] border-transparent' : 'bg-green-50 text-green-700 border-green-200'
          }`}>
            <span className="status-dot bg-green-500" />
            정상 <span className="inline-block min-w-[1.6em] text-right tabular-nums">{statusCounts.normal}</span>
          </span>
          <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono font-bold border ${
            isDarkMode ? 'bg-[#FBBF24]/10 text-[#FBBF24] border-transparent' : 'bg-amber-50 text-amber-700 border-amber-200'
          }`}>
            <span className="status-dot bg-amber-500" />
            경고 <span className="inline-block min-w-[1.6em] text-right tabular-nums">{statusCounts.warning}</span>
          </span>
          <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono font-bold border ${
            isDarkMode ? 'bg-[#FB5D75]/10 text-[#FB5D75] border-transparent' : 'bg-red-50 text-red-600 border-red-200'
          }`}>
            <span className="status-dot bg-red-500" />
            위험 <span className="inline-block min-w-[1.6em] text-right tabular-nums">{statusCounts.danger}</span>
          </span>
        </div>
      )}
    </div>
  );
};

// id/이름/상태/지표 값이 실제로 바뀐 경우에만 리렌더링 (메인 그리드와 같은 타이밍에 움직이도록)
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
