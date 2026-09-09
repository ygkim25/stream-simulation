import { useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { Center } from '@react-three/drei';
import { SHAPE_PRESETS, classifyShape } from '../utils/equipShapePresets';
import EquipShape3D from './EquipShape3D';
import CustomGltfModel from './CustomGltfModel';

const PREVIEW_COLOR = '#60A5FA'; // 상태색과 무관한 미리보기 전용 색(파란색) - 프리셋 모양 자체만 보여줌
const DRAG_SENSITIVITY = 0.6; // 가로로 1px 끌 때 몇 도 돌지

// 프리셋 선택 위에 크게 뜨는 3D 미리보기. 카메라가 아니라 오브젝트 자체를 마우스로 끌어서
// 돌릴 수 있게 해서, 여기서 돌려놓은 각도가 곧바로 실제 3D 배치도에 적용되는 회전값이 됨
// (따로 회전 슬라이더를 둘 필요 없이, 보이는 대로가 곧 설정임)
const ShapeStage = ({ shape, modelId, rotationY = 0, onChangeRotation, isDarkMode }) => {
  const dragRef = useRef(null);

  const handlePointerDown = (e) => {
    dragRef.current = { startX: e.clientX, startRotation: rotationY };
    const handleMove = (moveEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const delta = (moveEvent.clientX - drag.startX) * DRAG_SENSITIVITY;
      const next = ((Math.round(drag.startRotation + delta) % 360) + 360) % 360;
      onChangeRotation(next);
    };
    const handleUp = () => {
      dragRef.current = null;
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  return (
    <div
      onPointerDown={handlePointerDown}
      title="드래그해서 방향을 돌려보세요"
      className={`w-full h-28 rounded-lg overflow-hidden border cursor-grab active:cursor-grabbing ${
        isDarkMode ? 'bg-[#0D1224] border-[#232B45]' : 'bg-gray-50 border-gray-200'
      }`}
    >
      <Canvas camera={{ position: [0, 0.55, 1], fov: 38 }}>
        <ambientLight intensity={0.9} />
        <directionalLight position={[2, 3, 2]} intensity={0.9} />
        <group position={[-0.06, 0.03, 0]} rotation={[0, (rotationY * Math.PI) / 180, 0]}>
          {modelId ? (
            <CustomGltfModel key={modelId} modelId={modelId} scale={0.6} center />
          ) : (
            <Center key={shape}>
              <EquipShape3D shape={shape} hex={PREVIEW_COLOR} />
            </Center>
          )}
        </group>
      </Canvas>
    </div>
  );
};

// 편집 모드에서 설비 하나를 선택했을 때 뜨는 3D 모양 설정 패널 - 프리셋 선택 또는 GLB 모델 업로드
const EquipShapePanel = ({ equip, shapeConfig, onChangePreset, onUploadModel, onChangeRotation, onReset, isDarkMode }) => {
  const fileInputRef = useRef(null);
  // shapeConfig/equip이 바뀔 때마다(다른 설비 선택, 초기화 등) 항상 최신 값을 그대로 씀 -
  // 별도 state로 들고 있으면 프리셋이 바뀌어도 미리보기가 안 따라가는 문제가 있었음
  const activeShape = shapeConfig?.type === 'preset' ? shapeConfig.preset : classifyShape(equip.equipName);
  const rotationY = shapeConfig?.rotationY || 0;

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) onUploadModel(file);
  };

  const statusText = !shapeConfig
    ? '자동 (설비명 기반 추정)'
    : shapeConfig.type === 'model'
      ? `업로드한 모델 (${shapeConfig.fileName})`
      : `프리셋 · ${SHAPE_PRESETS.find(p => p.key === shapeConfig.preset)?.label || shapeConfig.preset}`;

  return (
    <div className={`w-64 max-h-[calc(100%-1rem)] shrink-0 rounded-xl border p-3 flex flex-col gap-3 overflow-y-auto shadow-lg backdrop-blur-sm ${
      isDarkMode ? 'bg-[#12172A]/95 border-[#1E253D] text-[#EDF1FC]' : 'bg-white/95 border-gray-200 text-gray-800'
    }`}>
      <div>
        <p className={`text-[10px] font-bold uppercase tracking-wide ${isDarkMode ? 'text-[#5C6584]' : 'text-gray-400'}`}>3D 모양 설정</p>
        <p className="text-sm font-bold truncate">{equip.equipName}</p>
      </div>

      <div className={`text-[11px] px-2.5 py-2 rounded-lg ${isDarkMode ? 'bg-[#0D1224] text-[#9FACC9]' : 'bg-gray-50 text-gray-600'}`}>
        현재: {statusText}
      </div>

      <div>
        <p className={`text-[11px] font-semibold mb-1.5 ${isDarkMode ? 'text-[#9FACC9]' : 'text-gray-500'}`}>미리보기</p>
        <ShapeStage
          shape={activeShape}
          modelId={shapeConfig?.type === 'model' ? shapeConfig.modelId : undefined}
          rotationY={rotationY}
          onChangeRotation={onChangeRotation}
          isDarkMode={isDarkMode}
        />
      </div>

      <div>
        <p className={`text-[11px] font-semibold mb-1.5 ${isDarkMode ? 'text-[#9FACC9]' : 'text-gray-500'}`}>프리셋 선택</p>
        <div className="grid grid-cols-3 gap-1.5">
          {SHAPE_PRESETS.map(p => {
            // 명시적으로 프리셋을 고른 적 없어도(자동 추정 중이어도) 지금 실제로 보이는
            // 모양은 activeShape이므로, 그 프리셋이 미리 선택돼있는 것처럼 보이게 함
            const isActive = shapeConfig?.type !== 'model' && activeShape === p.key;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => onChangePreset(p.key)}
                className={`px-1.5 py-1.5 rounded-lg text-[10.5px] font-semibold transition-colors border ${
                  isActive
                    ? (isDarkMode ? 'bg-[#1E2A4A] text-[#22D3EE] border-[#22D3EE]/40' : 'bg-green-50 text-green-700 border-green-300')
                    : (isDarkMode ? 'border-[#232B45] text-[#9FACC9] hover:bg-[#151B30]' : 'border-gray-200 text-gray-600 hover:bg-gray-50')
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className={`text-[11px] font-semibold mb-1.5 ${isDarkMode ? 'text-[#9FACC9]' : 'text-gray-500'}`}>3D 모델 업로드 (.glb/.gltf)</p>
        <input ref={fileInputRef} type="file" accept=".glb,.gltf" className="hidden" onChange={handleFileChange} />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className={`w-full px-3 py-2 rounded-lg text-[11px] font-semibold transition-colors border ${
            isDarkMode ? 'border-[#232B45] text-[#9FACC9] hover:bg-[#151B30]' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          파일 선택
        </button>
      </div>

      <button
        type="button"
        onClick={onReset}
        disabled={!shapeConfig}
        className={`w-full px-3 py-2 rounded-lg text-[11px] font-semibold transition-colors border ${
          !shapeConfig
            ? (isDarkMode ? 'border-[#1E253D] text-[#3A4266] cursor-not-allowed' : 'border-gray-100 text-gray-300 cursor-not-allowed')
            : (isDarkMode ? 'border-[#FB5D75]/30 text-[#FB5D75] hover:bg-[#FB5D75]/10' : 'border-red-200 text-red-500 hover:bg-red-50')
        }`}
      >
        초기화 (자동 추정으로)
      </button>
    </div>
  );
};

export default EquipShapePanel;
