import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, PieChart, Pie, Legend, LabelList,
} from 'recharts';
import Header from '../components/Header';
import LoadingSpinner from '../components/LoadingSpinner';
import AnimatedNumber from '../components/AnimatedNumber';
import FullRankingModal from '../components/FullRankingModal';
import { getStatusMeta } from '../utils/statusStyles';
import { API_BASE_URL } from '../utils/apiConfig';
import { fetchHistoryFromBackend } from '../utils/historyApi';

// 기간 프리셋 - 백엔드에 집계 API가 없어서 원본 기록을 그대로 내려받아 프론트에서 계산하는
// 프로토타입이라, 기간이 너무 길면(설비가 많고 틱이 잦으면) 느려질 수 있어 우선 짧은 범위만 제공
const RANGE_OPTIONS = [
  { value: 1, label: '오늘' },
  { value: 3, label: '최근 3일' },
  { value: 7, label: '최근 7일' },
];

const STATUS_COLORS = { danger: '#FB5D75', warning: '#FBBF24', normal: '#34D399' };
const STATUS_PRIORITY = { '위험': 2, '경고': 1, '정상': 0 };

// 백엔드 집계 없이 매번 원본 기록을 통째로 받아오는 구조라 최초 조회가 느릴 수 있음 - 한 번 받아온
// 구간은 이 브라우저 탭 안에서 캐시해두고, 재방문/탭 전환 시엔 이 캐시를 먼저 그대로 보여준 뒤
// 뒤에서 조용히 최신 데이터로 갱신함 (로딩 스피너를 다시 볼 필요가 없게)
const reportCacheKey = (days) => `reportCache_${days}`;
const loadReportCache = (days) => {
  try {
    const raw = sessionStorage.getItem(reportCacheKey(days));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
const saveReportCache = (days, data) => {
  try {
    sessionStorage.setItem(reportCacheKey(days), JSON.stringify(data));
  } catch {
    // sessionStorage를 못 쓰거나 용량 초과면 캐시 없이 그냥 넘어감 (기능엔 영향 없음)
  }
};

// ==========================================
// 기간별 설비 상태 통계 리포트 - 백엔드 집계 API 없이, 이미 있는 히스토리 내보내기 API
// (fetchHistoryFromBackend - CSV 내보내기에서 쓰는 것과 동일)로 원본 기록을 받아와
// 프론트에서 직접 집계하는 프로토타입 화면
// ==========================================
const ReportScreen = ({ user, route, setRoute, openMyPage, isDarkMode, setIsDarkMode, isAlarmOn, setIsAlarmOn }) => {
  const [rangeDays, setRangeDays] = useState(1);
  const [rows, setRows] = useState(() => loadReportCache(1)?.rows ?? []);
  const [equipNameById, setEquipNameById] = useState(() => loadReportCache(1)?.equipNameById ?? {});
  const [isLoading, setIsLoading] = useState(() => !loadReportCache(1));
  const [loadError, setLoadError] = useState('');
  // TOP5 카드의 "+" 버튼으로 여는 전체 순위 모달 - null이면 닫힘
  const [rankModal, setRankModal] = useState(null);

  // 실제로 서버에서 데이터를 몇 번째로 받아왔는지 세는 값 - 캐시로 보여준 화면(0번)과 이번
  // 세션에서 처음으로 실제로 받아온 데이터(1번)까지는 "화면이 만들어지는 중"으로 보고 TOP5
  // 막대에 깜빡임 효과를 넣지 않음. 2번째로 받아온 데이터(15초 뒤)부터 진짜 변화로 보고 효과를 줌
  const loadGenerationRef = useRef(0);
  const [dataGeneration, setDataGeneration] = useState(0);
  // TOP5 막대 애니메이션 판단에 쓰는 "직전 값" 기억 - 탭(오늘/최근3일/최근7일)을 바꾸면 같이 리셋됨
  const prevTop5ValuesRef = useRef({});
  // React StrictMode(개발 모드)는 관련 effect를 같은 값으로 두 번 연달아 호출할 수 있어서,
  // 그때마다 ref를 새로 덮어쓰면 두 번째 호출이 "방금 자기가 갱신한 값"과 비교하게 되어
  // 애니메이션이 안 나오거나 두 번 재생되는 것처럼 보임 - 같은 입력이면 건너뛰어서 막음
  const lastProcessedTop5Ref = useRef(null);

  // 도넛 차트가 처음 화면이 뜰 때만 그려지는 애니메이션이 나오게(그 이후 15초마다 갱신될 땐
  // 다시 안 그려지도록) - 첫 로딩이 끝난 뒤 애니메이션 한 번 재생될 시간만 기다렸다가 잠금.
  // (TOP5 막대는 항목별로 "처음 등장"을 따로 추적하는 changedIds 쪽에서 처리함 - 나중에 새로
  // 등장하는 설비도 있어서 페이지 로딩 시점 하나로만 판단하면 안 됨)
  const [hasRevealed, setHasRevealed] = useState(false);
  useEffect(() => {
    if (isLoading || hasRevealed) return;
    const timer = setTimeout(() => setHasRevealed(true), 1200);
    return () => clearTimeout(timer);
  }, [isLoading, hasRevealed]);

  // 오늘/최근3일/최근7일 탭을 바꿨을 때 - 캐시가 있으면 그 값을 즉시 보여주고, 없으면 로딩
  // 상태로 리셋함 (setState-in-effect를 피하려고 렌더 중에 바로 처리 - React 공식 문서가
  // 안내하는 "prop이 바뀌면 state를 조정하는" 패턴)
  const [prevRangeDays, setPrevRangeDays] = useState(rangeDays);
  if (rangeDays !== prevRangeDays) {
    setPrevRangeDays(rangeDays);
    const cached = loadReportCache(rangeDays);
    setRows(cached?.rows ?? []);
    setEquipNameById(cached?.equipNameById ?? {});
    setIsLoading(!cached);
    setLoadError('');
    setDataGeneration(0);
  }

  // 탭(오늘/최근3일/최근7일)이 바뀌면 애니메이션 판단용 ref들도 같이 리셋함 - ref는 렌더 중에
  // 못 건드리므로 effect에서 처리 (아래 두 effect보다 먼저 선언해서, 같은 커밋 안에서 이 리셋이
  // 먼저 반영된 뒤에 로딩/비교 effect가 실행되게 함)
  useEffect(() => {
    loadGenerationRef.current = 0;
    prevTop5ValuesRef.current = {};
    lastProcessedTop5Ref.current = null;
  }, [rangeDays]);

  // Top5/표가 실시간으로 갱신되어 보이도록 일정 주기로 다시 집계함 (REFRESH_MS)
  useEffect(() => {
    let cancelled = false;
    let isFirstLoad = !loadReportCache(rangeDays);
    const headers = user?.token ? { Authorization: `Bearer ${user.token}` } : {};

    const load = async () => {
      if (isFirstLoad) setIsLoading(true);
      const to = new Date();
      const from = new Date(to.getTime() - rangeDays * 24 * 60 * 60 * 1000);
      const myGeneration = ++loadGenerationRef.current;
      try {
        const [tempRows, elecRows, tempList, elecList] = await Promise.all([
          fetchHistoryFromBackend('temp', from, to, headers),
          fetchHistoryFromBackend('elec', from, to, headers),
          axios.get(`${API_BASE_URL}/api/live/monitoring/temp`, { headers }).then(r => r.data || []).catch(() => []),
          axios.get(`${API_BASE_URL}/api/live/monitoring/elec`, { headers }).then(r => r.data || []).catch(() => []),
        ]);
        if (cancelled) return;
        setLoadError('');
        // history/export 응답엔 equipName이 없어서, 현재 목록 조회에서 이름만 따로 매핑함
        const nameMap = {};
        [...tempList, ...elecList].forEach(dto => { nameMap[dto.equipId] = dto.equipName; });
        const mergedRows = [...tempRows, ...elecRows];
        setEquipNameById(nameMap);
        setRows(mergedRows);
        setDataGeneration(myGeneration);
        saveReportCache(rangeDays, { rows: mergedRows, equipNameById: nameMap });
      } catch (e) {
        if (!cancelled && isFirstLoad) setLoadError('데이터를 불러오지 못했습니다.');
        console.error('리포트 데이터 조회 실패:', e);
      } finally {
        if (!cancelled) setIsLoading(false);
        isFirstLoad = false;
      }
    };

    load();
    const REFRESH_MS = 15000;
    const timer = setInterval(load, REFRESH_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [rangeDays, user?.token]);

  // 온도/전력은 완전히 분리된 도메인이라 "온도 위험 TOP5"/"전력 위험 TOP5"는 도메인별로 따로
  // 발생 횟수를 셈(상태가 바뀐 시점만 카운트). 반면 표/합계에 쓰는 정상/경고/위험은 "이 설비가
  // 전체적으로 몇 번이나 정상/경고/위험이었는지"를 뜻하므로, 온도·전력 각각의 발생 횟수를 단순히
  // 더하면(둘 다 계속 정상이면 1+1=2가 되어버림) 안 되고, 두 도메인 중 더 안 좋은 쪽을 그 순간의
  // 설비 상태로 보고 하나로 합친 타임라인에서 전환 횟수를 세야 함
  const { perEquip, totals } = useMemo(() => {
    const byEquip = {};
    rows.forEach(r => {
      if (!r.equipId) return;
      const domain = r.temperature != null ? 'temp' : (r.power != null ? 'power' : null);
      if (!domain) return;
      (byEquip[r.equipId] ??= []).push({ ...r, domain });
    });

    const map = {};
    const t = { normal: 0, warning: 0, danger: 0 };
    Object.entries(byEquip).forEach(([equipId, events]) => {
      const bucket = {
        equipId,
        tempNormal: 0, tempWarning: 0, tempDanger: 0, tempSum: 0, tempCount: 0,
        powerNormal: 0, powerWarning: 0, powerDanger: 0, powerSum: 0, powerCount: 0,
        normal: 0, warning: 0, danger: 0,
      };
      const sorted = [...events].sort((a, b) => new Date(a.receivedAt) - new Date(b.receivedAt));
      const curLabel = { temp: null, power: null };
      let prevCombined = null;
      sorted.forEach(r => {
        const label = getStatusMeta(r.status).label;
        if (r.domain === 'temp') { bucket.tempSum += r.temperature; bucket.tempCount += 1; } else { bucket.powerSum += r.power; bucket.powerCount += 1; }

        // 온도/전력 TOP5 차트용 - 도메인별 발생 횟수 (해당 도메인 안에서 상태가 바뀐 시점만)
        if (label !== curLabel[r.domain]) {
          if (label === '위험') bucket[`${r.domain}Danger`] += 1;
          else if (label === '경고') bucket[`${r.domain}Warning`] += 1;
          else bucket[`${r.domain}Normal`] += 1;
        }
        curLabel[r.domain] = label;

        // 표/합계용 - 온도·전력 중 더 안 좋은 쪽을 설비의 그 순간 상태로 보고, 그 상태가
        // 바뀐 시점만 카운트 (두 도메인 다 있으면 어느 한쪽만 바뀌어도 재평가됨)
        const known = Object.values(curLabel).filter(Boolean);
        const combined = known.reduce((worst, l) => (STATUS_PRIORITY[l] > STATUS_PRIORITY[worst] ? l : worst), known[0]);
        if (combined !== prevCombined) {
          prevCombined = combined;
          if (combined === '위험') { bucket.danger += 1; t.danger += 1; }
          else if (combined === '경고') { bucket.warning += 1; t.warning += 1; }
          else { bucket.normal += 1; t.normal += 1; }
        }
      });
      map[equipId] = bucket;
    });
    const list = Object.values(map).map(b => ({
      ...b,
      equipName: equipNameById[b.equipId] || b.equipId,
      avgTemp: b.tempCount ? b.tempSum / b.tempCount : null,
      avgPower: b.powerCount ? b.powerSum / b.powerCount : null,
    }));
    list.sort((a, b) => (b.danger - a.danger) || (b.warning - a.warning));
    return { perEquip: list, totals: t };
  }, [rows, equipNameById]);

  const top5Temp = useMemo(() => (
    [...perEquip].filter(eq => eq.tempDanger > 0).sort((a, b) => b.tempDanger - a.tempDanger).slice(0, 5)
  ), [perEquip]);
  const top5Power = useMemo(() => (
    [...perEquip].filter(eq => eq.powerDanger > 0).sort((a, b) => b.powerDanger - a.powerDanger).slice(0, 5)
  ), [perEquip]);
  // 온도/전력 두 그래프의 막대 길이를 같은 기준으로 비교할 수 있도록 X축 최댓값을 맞춤
  const top5MaxValue = useMemo(() => Math.max(
    1,
    ...top5Temp.map(eq => eq.tempDanger),
    ...top5Power.map(eq => eq.powerDanger),
  ), [top5Temp, top5Power]);

  // 갱신될 때마다 값이 바뀌었거나 새로 등장한 막대만 깜빡임 효과가 나오게 - 직전에 실제로
  // 화면에 반영됐던 값을 기억해뒀다가 비교함. 다만 dataGeneration이 2 미만이면(캐시로 보여준
  // 화면 + 이번 세션 첫 실제 조회) 아직 "화면이 만들어지는 중"이므로 효과를 주지 않음 - 그
  // 상태에서도 비교 기준(prevTop5ValuesRef)은 계속 갱신해둬야 다음 진짜 변화를 정확히 잡아냄.
  // ref는 렌더 중에 못 읽으므로 비교는 폴링 결과가 반영된 뒤(effect)에 한 번씩 하고, 그 결과만
  // state로 들고 있음
  const [changedTempIds, setChangedTempIds] = useState(() => new Set());
  const [changedPowerIds, setChangedPowerIds] = useState(() => new Set());
  useEffect(() => {
    if (lastProcessedTop5Ref.current?.temp === top5Temp && lastProcessedTop5Ref.current?.power === top5Power) {
      return;
    }
    lastProcessedTop5Ref.current = { temp: top5Temp, power: top5Power };
    const isStillSettling = dataGeneration < 2;
    const changedTemp = new Set();
    const changedPower = new Set();
    top5Temp.forEach(eq => {
      const key = `temp-${eq.equipId}`;
      const prev = prevTop5ValuesRef.current[key];
      if (!isStillSettling && prev !== eq.tempDanger) changedTemp.add(eq.equipId);
      prevTop5ValuesRef.current[key] = eq.tempDanger;
    });
    top5Power.forEach(eq => {
      const key = `power-${eq.equipId}`;
      const prev = prevTop5ValuesRef.current[key];
      if (!isStillSettling && prev !== eq.powerDanger) changedPower.add(eq.equipId);
      prevTop5ValuesRef.current[key] = eq.powerDanger;
    });
    setChangedTempIds(changedTemp);
    setChangedPowerIds(changedPower);
  }, [top5Temp, top5Power, dataGeneration]);

  return (
    <div className={`w-full min-w-[320px] flex flex-col transition-colors h-[calc(100vh/1.1)] max-h-[calc(1080px/1.1)] overflow-hidden ${
      isDarkMode ? 'bg-[#0A0E1A]' : 'bg-gray-50'
    }`}>
      <Header
        user={user}
        route={route}
        setRoute={setRoute}
        openMyPage={openMyPage}
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
        isAlarmOn={isAlarmOn}
        setIsAlarmOn={setIsAlarmOn}
      />

      <div className="flex-1 min-h-0 p-5 lg:p-8 flex flex-col gap-5">
        <div className="flex items-center justify-between gap-3 flex-wrap shrink-0">
          <div className="flex items-center gap-2.5">
            <div className={`flex items-center p-1 rounded-full border shrink-0 transition-colors ${
              isDarkMode ? 'bg-[#0D1224] border-[#232B45]' : 'bg-white border-gray-200 shadow-sm'
            }`}>
              {RANGE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setRangeDays(opt.value)}
                  className={`px-3.5 py-1 rounded-full text-[12px] font-bold tracking-wide transition-colors ${
                    rangeDays === opt.value
                      ? (isDarkMode ? 'bg-[#1E2A4A] text-[#22D3EE] border border-[#22D3EE]/40' : 'bg-green-600 text-white shadow-sm')
                      : (isDarkMode ? 'text-[#7D87A8] hover:text-[#B9C2DE] border border-transparent' : 'text-gray-500 hover:text-gray-800 border border-transparent')
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <span className="flex items-center gap-1.5 text-[11px] font-mono">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#34D399] opacity-60"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#34D399]"></span>
              </span>
              <span className="text-[#34D399] font-bold">LIVE ({perEquip.length}대)</span>
            </span>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            {!isLoading && !loadError && rows.length > 0 && (
              <div className="flex items-center gap-2 text-[11px]">
                <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono font-bold border ${
                  isDarkMode ? 'bg-[#34D399]/10 text-[#34D399] border-transparent' : 'bg-green-50 text-green-700 border-green-200'
                }`}>
                  <span className="status-dot bg-green-500" />
                  정상 <span className="inline-block min-w-[1.6em] text-right tabular-nums"><AnimatedNumber value={totals.normal} /></span>
                </span>
                <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono font-bold border ${
                  isDarkMode ? 'bg-[#FBBF24]/10 text-[#FBBF24] border-transparent' : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}>
                  <span className="status-dot bg-amber-500" />
                  경고 <span className="inline-block min-w-[1.6em] text-right tabular-nums"><AnimatedNumber value={totals.warning} /></span>
                </span>
                <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono font-bold border ${
                  isDarkMode ? 'bg-[#FB5D75]/10 text-[#FB5D75] border-transparent' : 'bg-red-50 text-red-600 border-red-200'
                }`}>
                  <span className="status-dot bg-red-500" />
                  위험 <span className="inline-block min-w-[1.6em] text-right tabular-nums"><AnimatedNumber value={totals.danger} /></span>
                </span>
              </div>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <LoadingSpinner size="md" isDarkMode={isDarkMode} label="불러오는 중..." />
          </div>
        ) : loadError ? (
          <div className={`flex-1 flex items-center justify-center text-sm ${isDarkMode ? 'text-[#FB5D75]' : 'text-red-500'}`}>
            {loadError}
          </div>
        ) : rows.length === 0 ? (
          <div className={`flex-1 flex items-center justify-center text-sm ${isDarkMode ? 'text-[#7D87A8]' : 'text-gray-400'}`}>
            이 기간에 누적된 데이터가 없습니다.
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col gap-5">
            {/* 온도/전력 위험 TOP5를 나란히 - 하나로 합쳐 보여주면 어느 지표 때문인지 안 보여서 분리함 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 shrink-0">
              {[
                { title: '온도 위험 발생 많은 설비 TOP 5', data: top5Temp, dataKey: 'tempDanger', changedIds: changedTempIds },
                { title: '전력 위험 발생 많은 설비 TOP 5', data: top5Power, dataKey: 'powerDanger', changedIds: changedPowerIds },
              ].map(chart => (
                <div key={chart.title} className={`rounded-2xl border p-5 ${isDarkMode ? 'bg-[#12172A] border-[#1E253D]' : 'bg-white border-gray-200 shadow-sm'}`}>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className={`text-base font-bold ${isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-800'}`}>{chart.title}</h3>
                    <button
                      type="button"
                      onClick={() => setRankModal({
                        title: chart.title.replace(' TOP 5', ''),
                        dataKey: chart.dataKey,
                        color: STATUS_COLORS.danger,
                        data: [...perEquip].filter(eq => eq[chart.dataKey] > 0).sort((a, b) => b[chart.dataKey] - a[chart.dataKey]),
                      })}
                      className={`text-[12px] font-semibold transition-colors cursor-pointer bg-transparent border-none ${
                        isDarkMode ? 'text-[#7D87A8] hover:text-[#EDF1FC]' : 'text-gray-400 hover:text-gray-800'
                      }`}
                    >
                      더보기
                    </button>
                  </div>
                  {chart.data.length === 0 ? (
                    <p className={`text-[13px] ${isDarkMode ? 'text-[#5C6584]' : 'text-gray-400'}`}>이 기간에 위험 상태가 없었습니다.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={240} initialDimension={{ width: 340, height: 240 }}>
                      <BarChart data={chart.data} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 0 }}>
                        <CartesianGrid stroke={isDarkMode ? '#1E253D' : '#E5E7EB'} strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" domain={[0, top5MaxValue]} tick={{ fontSize: 12, fill: isDarkMode ? '#7D87A8' : '#6B7280' }} allowDecimals={false} />
                        <YAxis type="category" dataKey="equipName" width={100} tick={{ fontSize: 13, fontWeight: 600, fill: isDarkMode ? '#DCE2F5' : '#1F2937' }} />
                        <Tooltip
                          cursor={{ fill: isDarkMode ? '#151B30' : '#F9FAFB' }}
                          contentStyle={{
                            backgroundColor: isDarkMode ? '#12172A' : '#FFFFFF',
                            border: `1px solid ${isDarkMode ? '#232B45' : '#E5E7EB'}`,
                            borderRadius: 10, fontSize: 13,
                          }}
                          labelStyle={{ color: isDarkMode ? '#EDF1FC' : '#1F2937' }}
                          itemStyle={{ color: isDarkMode ? '#EDF1FC' : '#1F2937' }}
                        />
                        <Bar
                          dataKey={chart.dataKey}
                          name="위험 횟수"
                          radius={[0, 6, 6, 0]}
                          barSize={20}
                          isAnimationActive={false}
                        >
                          {chart.data.map((eq, idx) => (
                            // Recharts 자체 애니메이션(isAnimationActive)을 쓰면 막대가 움직이는
                            // 동안 숫자 라벨이 안 보이는 문제가 있어서, 애니메이션은 항상 끄고
                            // 대신 CSS로 직접 줌 - 값이 바뀌었거나(changedIds) 이 TOP5에 처음
                            // 등장한 막대만 왼쪽부터 다시 채워지며 색도 잠깐 강조됨
                            <Cell
                              key={eq.equipId}
                              className={chart.changedIds.has(eq.equipId) ? 'report-bar-grow' : ''}
                              fill={STATUS_COLORS.danger}
                              fillOpacity={1 - idx * 0.15}
                            />
                          ))}
                          <LabelList
                            dataKey={chart.dataKey}
                            position="right"
                            isAnimationActive={false}
                            style={{ fontSize: 12, fontWeight: 700, fill: isDarkMode ? '#DCE2F5' : '#374151' }}
                          />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              ))}
            </div>

            {/* 설비별 전체 통계 표 + 오른쪽에 전체 상태 비율 요약 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 flex-1 min-h-0">
            <div className={`lg:col-span-2 rounded-2xl border flex flex-col min-h-0 ${isDarkMode ? 'bg-[#12172A] border-[#1E253D]' : 'bg-white border-gray-200 shadow-sm'}`}>
              <h3 className={`text-base font-bold px-5 pt-5 pb-3 shrink-0 ${isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-800'}`}>설비별 상세</h3>
              <div className="flex-1 min-h-0 overflow-y-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className={`sticky top-0 z-10 border-t border-b ${isDarkMode ? 'bg-[#0F1526] border-[#1E253D] text-[#9FACC9]' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>
                    <th className="text-left px-5 py-3 font-bold uppercase text-[11px] tracking-wide">설비</th>
                    <th className="text-center px-3 py-3 font-bold uppercase text-[11px] tracking-wide">정상</th>
                    <th className="text-center px-3 py-3 font-bold uppercase text-[11px] tracking-wide">경고</th>
                    <th className="text-center px-3 py-3 font-bold uppercase text-[11px] tracking-wide">위험</th>
                    <th className="text-right px-3 py-3 font-bold uppercase text-[11px] tracking-wide">평균 온도</th>
                    <th className="text-right px-5 py-3 font-bold uppercase text-[11px] tracking-wide">평균 전력</th>
                  </tr>
                </thead>
                <tbody>
                  {perEquip.map(eq => (
                    <tr
                      key={eq.equipId}
                      className={`border-t transition-colors ${
                        isDarkMode ? 'border-[#1E253D] text-[#DCE2F5] hover:bg-[#151B30]' : 'border-gray-100 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <td className="px-5 py-3 font-bold">{eq.equipName}</td>
                      <td className="px-3 py-3 text-center">
                        <span className={`inline-block min-w-[2.5em] px-2 py-1 rounded-full font-mono font-bold ${
                          isDarkMode ? 'bg-[#34D399]/10 text-[#34D399]' : 'bg-green-50 text-green-700'
                        }`}><AnimatedNumber value={eq.normal} /></span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`inline-block min-w-[2.5em] px-2 py-1 rounded-full font-mono font-bold ${
                          eq.warning > 0
                            ? (isDarkMode ? 'bg-[#FBBF24]/10 text-[#FBBF24]' : 'bg-amber-50 text-amber-700')
                            : (isDarkMode ? 'text-[#3A4266]' : 'text-gray-300')
                        }`}><AnimatedNumber value={eq.warning} /></span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`inline-block min-w-[2.5em] px-2 py-1 rounded-full font-mono font-bold ${
                          eq.danger > 0
                            ? (isDarkMode ? 'bg-[#FB5D75]/10 text-[#FB5D75]' : 'bg-red-50 text-red-600')
                            : (isDarkMode ? 'text-[#3A4266]' : 'text-gray-300')
                        }`}><AnimatedNumber value={eq.danger} /></span>
                      </td>
                      <td className={`px-3 py-3 text-right font-mono font-semibold ${isDarkMode ? 'text-[#B9C2DE]' : 'text-gray-600'}`}>
                        {eq.avgTemp != null ? <><AnimatedNumber value={eq.avgTemp} decimals={1} />℃</> : '-'}
                      </td>
                      <td className={`px-5 py-3 text-right font-mono font-semibold ${isDarkMode ? 'text-[#B9C2DE]' : 'text-gray-600'}`}>
                        {eq.avgPower != null ? <AnimatedNumber value={eq.avgPower} decimals={1} /> : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>

            {/* 전체 상태 비율 요약 */}
            <div className={`rounded-2xl border p-5 ${isDarkMode ? 'bg-[#12172A] border-[#1E253D]' : 'bg-white border-gray-200 shadow-sm'}`}>
              <h3 className={`text-base font-bold mb-2 ${isDarkMode ? 'text-[#EDF1FC]' : 'text-gray-800'}`}>전체 상태 비율</h3>
              {totals.normal + totals.warning + totals.danger === 0 ? (
                <p className={`text-[13px] ${isDarkMode ? 'text-[#5C6584]' : 'text-gray-400'}`}>이 기간에 집계된 데이터가 없습니다.</p>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={200} initialDimension={{ width: 200, height: 200 }}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: '정상', value: totals.normal, color: STATUS_COLORS.normal },
                          { name: '경고', value: totals.warning, color: STATUS_COLORS.warning },
                          { name: '위험', value: totals.danger, color: STATUS_COLORS.danger },
                        ]}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={45}
                        outerRadius={75}
                        paddingAngle={2}
                        stroke="none"
                        isAnimationActive={!hasRevealed}
                        animationDuration={1100}
                        animationEasing="ease-out"
                      >
                        {[STATUS_COLORS.normal, STATUS_COLORS.warning, STATUS_COLORS.danger].map(color => (
                          <Cell key={color} fill={color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: isDarkMode ? '#12172A' : '#FFFFFF',
                          border: `1px solid ${isDarkMode ? '#232B45' : '#E5E7EB'}`,
                          borderRadius: 10, fontSize: 13,
                        }}
                        labelStyle={{ color: isDarkMode ? '#EDF1FC' : '#1F2937' }}
                        itemStyle={{ color: isDarkMode ? '#EDF1FC' : '#1F2937' }}
                      />
                      <Legend
                        verticalAlign="bottom"
                        height={28}
                        formatter={(value) => <span style={{ color: isDarkMode ? '#B9C2DE' : '#374151', fontSize: 12, fontWeight: 600 }}>{value}</span>}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <p className={`text-[12px] text-center mt-1 ${isDarkMode ? 'text-[#5C6584]' : 'text-gray-400'}`}>
                    총 <AnimatedNumber value={totals.normal + totals.warning + totals.danger} />건 기준
                  </p>
                </>
              )}
            </div>
            </div>
          </div>
        )}
      </div>

      {rankModal && (
        <FullRankingModal
          title={rankModal.title}
          data={rankModal.data}
          dataKey={rankModal.dataKey}
          color={rankModal.color}
          isDarkMode={isDarkMode}
          onClose={() => setRankModal(null)}
        />
      )}
    </div>
  );
};

export default ReportScreen;
