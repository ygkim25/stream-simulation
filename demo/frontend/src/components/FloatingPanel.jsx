import { createPortal } from 'react-dom';

// 화면 어디로든 옮기고(헤더 드래그) 크기도 조절할(우하단 모서리 드래그) 수 있는 떠 있는 창.
// overflow-hidden인 부모 컨테이너 안에 그냥 absolute로 두면 위로 끌어올렸을 때 부모 경계에
// 잘려서 다시 못 잡는 위치로 가버리는 문제가 있어서, body에 포털로 띄워 항상 맨 위에 떠 있는
// 진짜 창처럼 동작하게 함. 위치/크기는 부모가 들고 있어야(controlled) 이 창을 껐다 켜도
// 마지막 위치/크기가 유지됨
const FloatingPanel = ({
  title, isDarkMode, pos, size, onPosChange, onSizeChange, onDragStart, onClose,
  minWidth = 220, minHeight = 140, maxWidth = 900, maxHeight = 700,
  headerRight, children,
}) => createPortal(
  <div
    className={`fixed flex flex-col rounded-lg overflow-hidden border shadow-2xl ${
      isDarkMode ? 'border-[#232B45] bg-[#0A0E1A]' : 'border-gray-300 bg-white'
    }`}
    style={{ width: size.width, height: size.height, left: pos.x, top: pos.y, zIndex: 9999 }}
  >
    <div
      onPointerDown={(e) => {
        onDragStart?.();
        const panelEl = e.currentTarget.parentElement;
        const startLeft = panelEl.offsetLeft;
        const startTop = panelEl.offsetTop;
        const startX = e.clientX;
        const startY = e.clientY;
        const handleMove = (moveEvent) => {
          // 화면 밖으로 완전히 나가면 다시 못 잡으니, 헤더 일부는 항상 화면 안에 남게 clamp
          const nextX = Math.min(window.innerWidth - 40, Math.max(-size.width + 40, startLeft + (moveEvent.clientX - startX)));
          const nextY = Math.min(window.innerHeight - 24, Math.max(0, startTop + (moveEvent.clientY - startY)));
          onPosChange({ x: nextX, y: nextY });
        };
        const handleUp = () => {
          window.removeEventListener('pointermove', handleMove);
          window.removeEventListener('pointerup', handleUp);
        };
        window.addEventListener('pointermove', handleMove);
        window.addEventListener('pointerup', handleUp);
      }}
      className={`shrink-0 h-6 flex items-center justify-between px-2 cursor-move select-none ${
        isDarkMode ? 'bg-[#12172A] text-[#9FACC9]' : 'bg-gray-100 text-gray-500'
      }`}
    >
      <span className="text-[10px] font-semibold truncate min-w-0" title={title}>{title}</span>
      <div className="flex items-center gap-2 shrink-0" onPointerDown={(e) => e.stopPropagation()}>
        {headerRight}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            title="닫기"
            className={`leading-none text-sm font-bold hover:opacity-70 ${isDarkMode ? 'text-[#9FACC9]' : 'text-gray-500'}`}
          >
            ✕
          </button>
        )}
      </div>
    </div>
    <div className="flex-1 min-h-0">{children}</div>
    <div
      onPointerDown={(e) => {
        e.stopPropagation();
        const startWidth = size.width;
        const startHeight = size.height;
        const startX = e.clientX;
        const startY = e.clientY;
        const handleMove = (moveEvent) => {
          onSizeChange({
            width: Math.min(maxWidth, Math.max(minWidth, startWidth + (moveEvent.clientX - startX))),
            height: Math.min(maxHeight, Math.max(minHeight, startHeight + (moveEvent.clientY - startY))),
          });
        };
        const handleUp = () => {
          window.removeEventListener('pointermove', handleMove);
          window.removeEventListener('pointerup', handleUp);
        };
        window.addEventListener('pointermove', handleMove);
        window.addEventListener('pointerup', handleUp);
      }}
      title="드래그해서 크기 조절"
      className={`absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize ${isDarkMode ? 'text-[#3A4266]' : 'text-gray-400'}`}
    >
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full">
        <path d="M13 3 L3 13 M13 8 L8 13 M13 13 L13 13" strokeLinecap="round" />
      </svg>
    </div>
  </div>,
  document.body,
);

export default FloatingPanel;
