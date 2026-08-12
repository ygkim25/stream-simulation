import { useEffect } from 'react';

// ref로 감싼 요소 바깥을 클릭하면 onOutside를 호출 (커스텀 드롭다운/인라인 편집 등
// 열림 상태를 바깥 클릭으로 닫을 때 공용으로 사용).
// onOutside는 매 렌더 새로 만들어지는 인라인 함수를 넘겨도 괜찮도록 deps에서 제외함 -
// 리스너가 실제로 동작하는 시점엔 항상 그 순간의 최신 클로저를 참조하므로 안전함
export const useClickOutside = (ref, onOutside, enabled = true) => {
  useEffect(() => {
    if (!enabled) return;
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        onOutside();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
};
