import React, { useEffect, useRef, useState } from 'react';

// 값이 바뀔 때 깜빡이지 않고 이전 값에서 새 값까지 숫자가 올라가는 것처럼 보여주는 컴포넌트.
// (실시간으로 계속 갱신되는 화면에서 숫자가 살아있는 느낌을 주기 위함)
//
// 정수(decimals=0)는 소수점으로 중간값을 보여줄 수 없어서, 부드럽게 보간하면 화면엔 한동안
// 그대로 있다가 어느 순간 갑자기 다음 정수로 튀는 것처럼 보임(이게 "깜빡인다"는 느낌의 원인).
// 그래서 정수는 실제로 1씩 증가/감소하며 그 값을 그대로 찍어주는 방식으로 셈.
// 값이 실제로 바뀔 때마다 popKey를 올려서(key로 씀) 숫자가 살짝 튀어오르며 다시 나타나는
// 효과(index.css의 .report-pop)가 매번 재생되게 함
const AnimatedNumber = ({ value, decimals = 0, duration = 800, suffix = '' }) => {
  const [display, setDisplay] = useState(value);
  // 지금 화면에 실제로 찍힌 값을 항상 들고 있음 - 애니메이션이 끝나기 전에 value가 또 바뀌어도
  // (기억해둔 "목표값"이 아니라) 지금 보이는 값에서부터 이어서 움직이게 하기 위함
  const displayRef = useRef(value);
  const [popKey, setPopKey] = useState(0);

  useEffect(() => {
    const setValue = (v) => {
      displayRef.current = v;
      setDisplay(v);
    };

    const from = displayRef.current;
    const to = value;
    if (from === to || Number.isNaN(to)) {
      setValue(to);
      return;
    }

    setPopKey(k => k + 1);

    if (decimals === 0) {
      const step = to > from ? 1 : -1;
      const totalSteps = Math.abs(to - from);
      const stepDuration = Math.max(40, Math.min(duration / totalSteps, 200));
      let current = from;
      const timer = setInterval(() => {
        current += step;
        setValue(current);
        if (current === to) clearInterval(timer);
      }, stepDuration);
      return () => clearInterval(timer);
    }

    const start = performance.now();
    let rafId;
    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - (1 - progress) ** 3;
      setValue(from + (to - from) * eased);
      if (progress < 1) rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [value, duration, decimals]);

  return (
    <span key={popKey} className={popKey > 0 ? 'inline-block report-pop' : 'inline-block'}>
      {display.toFixed(decimals)}{suffix}
    </span>
  );
};

export default AnimatedNumber;
