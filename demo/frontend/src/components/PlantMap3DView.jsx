import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html, Line, useTexture } from '@react-three/drei';
import { getStatusMeta } from '../utils/statusStyles';
import { STATUS_HEX, classifyShape } from '../utils/equipShapePresets';
import EquipShape3D from './EquipShape3D';
import CustomGltfModel from './CustomGltfModel';

const STATUS_PRIORITY = { green: 0, amber: 1, red: 2 };
const PLANE_WIDTH = 12;

// %좌표(0~100)를 바닥 평면 위 3D 좌표로 변환 (Three.js는 y가 위쪽이라, 2D의 y는 z축에 대응)
const toWorld = (xPct, yPct, depth) => [
  (xPct / 100 - 0.5) * PLANE_WIDTH,
  0,
  (yPct / 100 - 0.5) * depth,
];

const Floor = ({ image, onDepthReady, onClick, onPointerMove, onPointerLeave }) => {
  const texture = useTexture(image);
  const depth = useMemo(() => {
    const img = texture.image;
    const ratio = img?.height && img?.width ? img.height / img.width : 1;
    const d = PLANE_WIDTH * ratio;
    onDepthReady(d);
    return d;
  }, [texture, onDepthReady]);

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
      onClick={onClick}
      onPointerMove={onPointerMove}
      onPointerOut={() => { document.body.style.cursor = 'auto'; onPointerLeave(); }}
      onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
    >
      <planeGeometry args={[PLANE_WIDTH, depth]} />
      <meshStandardMaterial map={texture} />
    </mesh>
  );
};

// 구역 박스는 색만 보여주는 순수 시각 요소 - 클릭 판정은 여기 두지 않음(바닥 하나만 클릭을
// 받아서 클릭 지점 %좌표로 어느 구역인지 직접 계산함 - 구역별로 각자 클릭을 받으면 인접/중첩된
// 구역끼리 레이캐스팅 거리가 같아져 엉뚱한 구역이 뽑히는 문제가 있었음).
// 색 채우기만으로는 구역이 나뉘어 있다는 게 잘 안 보여서, 테두리 선과 이름표를 더함(2D 화면의
// 구역 표시와 같은 정보). isHovered는 "지금 클릭하면 이 구역이 선택된다"를 클릭 전에 미리
// 보여주는 용도 - 3D는 비스듬한 시점 때문에 경계선이 화면에 살짝 기울어 보여서 눈대중으로
// 정확히 클릭하기 어려운데, 계산으로 보정하려 하면 다른 구역을 잘못 침범하는 부작용이 생겨서
// 대신 클릭 전에 확인하고 조준을 조정할 수 있게 함
const ZoneBox = ({ zone, color, depth, isFocused, isHovered }) => {
  const w = (zone.widthPct / 100) * PLANE_WIDTH;
  const d = (zone.heightPct / 100) * depth;
  const [x, , z] = toWorld(zone.xPct + zone.widthPct / 2, zone.yPct + zone.heightPct / 2, depth);

  const corners = useMemo(() => {
    const tl = toWorld(zone.xPct, zone.yPct, depth);
    const tr = toWorld(zone.xPct + zone.widthPct, zone.yPct, depth);
    const br = toWorld(zone.xPct + zone.widthPct, zone.yPct + zone.heightPct, depth);
    const bl = toWorld(zone.xPct, zone.yPct + zone.heightPct, depth);
    const y = 0.021;
    return [
      [tl[0], y, tl[2]], [tr[0], y, tr[2]], [br[0], y, br[2]], [bl[0], y, bl[2]], [tl[0], y, tl[2]],
    ];
  }, [zone.xPct, zone.yPct, zone.widthPct, zone.heightPct, depth]);

  return (
    <>
      <mesh position={[x, 0.02, z]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w, d]} />
        <meshBasicMaterial color={color} transparent opacity={isFocused ? 0.36 : isHovered ? 0.32 : 0.22} />
      </mesh>
      <Line points={corners} color={isHovered ? '#FACC15' : color} lineWidth={isFocused || isHovered ? 2.5 : 1.5} />
      <Html position={[corners[0][0], 0.05, corners[0][2]]} distanceFactor={16} zIndexRange={[90, 0]}>
        <span style={{
          display: 'inline-block', transform: 'translate(2px, -100%)',
          background: isHovered ? '#FACC15' : color, color: '#0A0E1A', fontSize: 7, fontWeight: 800,
          padding: '1px 5px', borderRadius: 3, whiteSpace: 'nowrap', pointerEvents: 'none',
        }}>
          {zone.name}
        </span>
      </Html>
    </>
  );
};

// 화면상 렌더링 결과를 왼쪽으로 옮기는 용도(초기 전체 보기가 오른쪽으로 치우쳐 보이는 것 보정).
// setViewOffset은 같은 캔버스 크기에서 카메라가 보는 프러스텀만 픽셀 단위로 평행 이동시켜서
// 줌과 무관하게 항상 같은 픽셀만큼만 이동함. (구역 클릭 오작동은 이걸 완전히 뺀 상태에서도
// 똑같이 재현되는 게 실측으로 확인돼서, 이 컴포넌트와는 무관함 - 원인은 3D 비스듬한 시점 자체의
// 클릭 오차이고 handleFloorClick의 CLICK_MARGIN_PCT로 대응함)
const ViewShift = ({ pixels }) => {
  const { camera, size } = useThree();
  useEffect(() => {
    const fullWidth = size.width + pixels * 2;
    camera.setViewOffset(fullWidth, size.height, pixels * 2, 0, size.width, size.height);
    camera.updateProjectionMatrix();
    return () => {
      camera.clearViewOffset();
      camera.updateProjectionMatrix();
    };
  }, [camera, size, pixels]);
  return null;
};

// 기본 카메라(0,13,7)가 기본 타깃(0,0,0)에서 떨어진 오프셋. 구역에 초점을 맞출 때도 이 오프셋을
// (축소해서) 그대로 써서 보던 각도는 유지한 채 위치/거리만 바뀌게 함
const DEFAULT_CAMERA_OFFSET = { x: 0, y: 13, z: 7 };
const FOCUS_ZOOM = 0.5;
const FOCUS_ANIM_SEC = 0.6;

// 구역 클릭으로 focusPos가 바뀌면 그 지점으로, null이면 전체 기본 시점으로 카메라를 부드럽게
// 이동시킴. 매 프레임 원점으로 끌어당기면 사용자가 직접 돌려보던 시점을 계속 방해하게 되므로,
// focus가 "바뀐 순간"에만 짧게 애니메이션을 걸고 끝나면 손을 뗌(그 뒤엔 OrbitControls가 평소처럼
// 자유롭게 동작함)
const CameraRig = ({ focusKey, focusPos, controlsRef }) => {
  const animRef = useRef({ active: false, start: 0, fromTarget: null, fromCam: null, toTarget: null, toCam: null });
  const prevKeyRef = useRef(undefined);

  useFrame((state) => {
    const controls = controlsRef.current;
    if (!controls) return;
    const camera = controls.object;

    if (prevKeyRef.current !== focusKey) {
      const toTarget = focusPos || { x: 0, y: 0, z: 0 };
      const zoom = focusPos ? FOCUS_ZOOM : 1;
      const toCam = {
        x: toTarget.x + DEFAULT_CAMERA_OFFSET.x * zoom,
        y: toTarget.y + DEFAULT_CAMERA_OFFSET.y * zoom,
        z: toTarget.z + DEFAULT_CAMERA_OFFSET.z * zoom,
      };
      animRef.current = {
        active: true,
        start: state.clock.elapsedTime,
        fromTarget: controls.target.clone(),
        fromCam: camera.position.clone(),
        toTarget,
        toCam,
      };
      prevKeyRef.current = focusKey;
    }

    if (animRef.current.active) {
      const t = Math.min(1, (state.clock.elapsedTime - animRef.current.start) / FOCUS_ANIM_SEC);
      const eased = 1 - Math.pow(1 - t, 3);
      controls.target.lerpVectors(animRef.current.fromTarget, animRef.current.toTarget, eased);
      camera.position.lerpVectors(animRef.current.fromCam, animRef.current.toCam, eased);
      if (t >= 1) animRef.current.active = false;
    }
    controls.update();
  });
  return null;
};

// 3D 설비 모양을 한번에 전부 나타나게 두면 딱딱하게 느껴져서, 설비마다 delay만큼 시차를 두고
// 크기 0에서 1로 부드럽게 커지며 등장하게 함. Date.now()가 아니라 r3f 자체 시계(elapsedTime)를
// useFrame 콜백 안에서만 읽어 시작 시각을 잡음 (렌더 중에 시간을 읽으면 impure 경고가 남)
// simplified가 true면(2D 편집 중 켜는 작은 실시간 미리보기용) 애니메이션 없이 바로 완성된
// 상태로 그림 - 위치가 계속 바뀌는 미리보기에서 등장 애니메이션까지 겹치면 너무 정신없어짐
const PopIn = ({ position, rotationY = 0, delay = 0, simplified = false, children }) => {
  const ref = useRef();
  const startRef = useRef(null);
  useFrame((state) => {
    if (simplified || !ref.current) return;
    if (startRef.current === null) startRef.current = state.clock.elapsedTime;
    const elapsed = state.clock.elapsedTime - startRef.current - delay / 1000;
    const progress = Math.min(1, Math.max(0, elapsed / 0.4));
    // 살짝 넘치듯 커지는 back-out 이징 - 딱 멈추는 것보다 자연스러움
    const c1 = 1.70158;
    const c3 = c1 + 1;
    const eased = 1 + c3 * Math.pow(progress - 1, 3) + c1 * Math.pow(progress - 1, 2);
    ref.current.scale.setScalar(Math.max(0, eased));
  });
  return <group ref={ref} position={position} rotation={[0, rotationY, 0]} scale={simplified ? 1 : 0}>{children}</group>;
};

// 위험(red) 상태 설비 바닥에 레이더처럼 퍼지며 옅어지는 경고 링 - 카메라를 움직이지 않고도
// 눈에 띄게 하기 위한 용도
const AlertRing = ({ position }) => {
  const ref = useRef();
  useFrame((state) => {
    if (!ref.current) return;
    const cycle = 1.4;
    const t = (state.clock.elapsedTime % cycle) / cycle;
    ref.current.scale.setScalar(0.35 + t * 1.3);
    ref.current.material.opacity = 0.5 * (1 - t);
  });
  return (
    <mesh ref={ref} position={[position[0], 0.03, position[2]]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.22, 0.28, 32]} />
      <meshBasicMaterial color="#EF4444" transparent opacity={0.5} depthWrite={false} />
    </mesh>
  );
};

const EquipMarker = ({ equip, pos, depth, statusColor, onSelect, delay = 0 }) => {
  const [x, , z] = toWorld(pos.xPct, pos.yPct, depth);
  const hex = STATUS_HEX[statusColor] || STATUS_HEX.green;
  const [hovered, setHovered] = useState(false);
  const [appeared, setAppeared] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setAppeared(true), Math.max(40, delay));
    return () => clearTimeout(id);
  }, [delay]);
  // 3D 구체 + 레이캐스팅 기반 호버는 마커가 가까이 붙어있으면 서로 히트 영역이 겹쳐 인식이
  // 불안정하고, occlude 라벨은 다른 마커의 히트 구체에 가려 사라지는 문제가 있었음.
  // 그래서 점(닷)과 라벨을 전부 실제 DOM(Html)으로 그려 일반 마우스 이벤트로만 처리함 -
  // 2D 마커와 동일한 방식이라 훨씬 안정적으로 인식됨
  return (
    <Html position={[x, 0.24, z]} center distanceFactor={16} zIndexRange={[100, 0]}>
      <div
        onClick={() => onSelect(equip.equipId)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
          cursor: 'pointer', userSelect: 'none',
          opacity: appeared ? 1 : 0,
          transform: `${hovered ? 'scale(1.3)' : 'scale(1)'} translateY(${appeared ? 0 : 5}px)`,
          transition: appeared
            ? 'transform 120ms ease, opacity 200ms ease'
            : 'transform 320ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 220ms ease',
        }}
      >
        <span style={{
          background: hovered ? 'rgba(34,211,238,0.9)' : 'rgba(0,0,0,0.65)',
          color: hovered ? '#0A0E1A' : '#fff',
          fontSize: 6.5, fontWeight: 700,
          padding: '0.5px 4px', borderRadius: 4, whiteSpace: 'nowrap',
          transition: 'background 120ms ease, color 120ms ease',
        }}>
          {equip.equipName}
        </span>
        <span
          className={statusColor === 'red' ? 'animate-pulse' : ''}
          style={{
            width: 7, height: 7, borderRadius: '50%', background: hex,
            border: hovered ? '1.5px solid #22D3EE' : '1.5px solid white',
            boxShadow: hovered ? '0 0 0 2px rgba(34,211,238,0.55)' : '0 1px 2px rgba(0,0,0,0.4)',
            transition: 'border 120ms ease, box-shadow 120ms ease',
          }}
        />
      </div>
    </Html>
  );
};

// 설비 배치도의 3D "보기 전용" 모드 - 배치/구역 편집은 여전히 2D 화면에서만 함.
// simplified: 2D 편집 중 실시간으로 계속 다시 그려지는 작은 미리보기 인셋용 - 등장 애니메이션/
// 경고 링 펄스처럼 계속 움직이는 장식 효과를 꺼서 정신없지 않게 함(위치/구역 반영 자체는 그대로 실시간)
const PlantMap3DView = ({ image, placedEquipments, positions, zones, metricTab, isDarkMode, equipmentShapes = {}, onSelectEquip, simplified = false }) => {
  const [depth, setDepth] = React.useState(PLANE_WIDTH);
  const [focusZoneId, setFocusZoneId] = useState(null);
  // 리셋 버튼은 focusZoneId가 이미 null이어도(=구역을 클릭한 적 없이 마우스로만 돌리고
  // 있던 경우) 눌렀을 때 반드시 원래 시점으로 되돌아가야 함. CameraRig는 focusKey "값이
  // 바뀔 때만" 애니메이션을 트는데 null->null은 값이 안 바뀌므로, 리셋 버튼을 누를 때마다
  // 이 값을 증가시켜 focusKey 자체를 강제로 바꿔줌
  const [resetToken, setResetToken] = useState(0);
  const [hoverZoneId, setHoverZoneId] = useState(null);
  const controlsRef = useRef();

  // 클릭 지점의 %좌표가 정확히 어느 구역 사각형 안에 드는지만 봄(여유 범위로 보정하려던 시도는
  // 구역 크기가 서로 다를 때 작은 구역이 옆의 정상적인 구역 클릭까지 가로채는 부작용이 있었음).
  // 대신 hover 시 미리 어느 구역이 선택될지 보여줘서(ZoneBox의 isHovered), 클릭 전에 눈으로
  // 확인하고 조준을 조정할 수 있게 함
  const resolveZoneAt = (xPct, yPct) => {
    const matches = zones.filter(z => xPct >= z.xPct && xPct <= z.xPct + z.widthPct
      && yPct >= z.yPct && yPct <= z.yPct + z.heightPct);
    if (matches.length === 0) return null;
    return matches.reduce((a, b) => (a.widthPct * a.heightPct <= b.widthPct * b.heightPct ? a : b));
  };

  const eventToPct = (event) => ({
    xPct: (event.point.x / PLANE_WIDTH + 0.5) * 100,
    yPct: (event.point.z / depth + 0.5) * 100,
  });

  const handleFloorClick = (event) => {
    event.stopPropagation();
    const { xPct, yPct } = eventToPct(event);
    const zone = resolveZoneAt(xPct, yPct);
    setFocusZoneId(prev => (zone && prev === zone.id ? null : (zone ? zone.id : null)));
  };

  const handleFloorPointerMove = (event) => {
    const { xPct, yPct } = eventToPct(event);
    const zone = resolveZoneAt(xPct, yPct);
    setHoverZoneId(zone ? zone.id : null);
  };

  const handleResetView = () => {
    setFocusZoneId(null);
    setResetToken(t => t + 1);
  };

  const zoneColors = useMemo(() => {
    const map = {};
    zones.forEach(zone => {
      let worst = 'green';
      placedEquipments.forEach(eq => {
        const pos = positions[eq.equipId];
        if (!pos) return;
        const inside = pos.xPct >= zone.xPct && pos.xPct <= zone.xPct + zone.widthPct
          && pos.yPct >= zone.yPct && pos.yPct <= zone.yPct + zone.heightPct;
        if (!inside) return;
        const color = getStatusMeta(metricTab === 'temperature' ? eq.status : eq.powerStatus).color;
        if (STATUS_PRIORITY[color] > STATUS_PRIORITY[worst]) worst = color;
      });
      map[zone.id] = STATUS_HEX[worst];
    });
    return map;
  }, [zones, placedEquipments, positions, metricTab]);

  const focusPos = useMemo(() => {
    const zone = zones.find(z => z.id === focusZoneId);
    if (!zone) return null;
    const [fx, , fz] = toWorld(zone.xPct + zone.widthPct / 2, zone.yPct + zone.heightPct / 2, depth);
    return { x: fx, y: 0, z: fz };
  }, [zones, focusZoneId, depth]);

  return (
    <div className="relative w-full h-full">
      {focusZoneId && (
        <button
          type="button"
          onClick={handleResetView}
          className={`absolute z-10 bottom-3 right-3 px-3 py-1.5 rounded-lg text-xs font-semibold border shadow-sm transition-colors ${
            isDarkMode
              ? 'bg-[#12172A]/90 border-[#232B45] text-[#9FACC9] hover:bg-[#1A2140]'
              : 'bg-white/90 border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          돌아가기
        </button>
      )}
      <Canvas
        shadows
        camera={{ position: [0, 13, 7], fov: 42 }}
        style={{ background: isDarkMode ? '#0A0E1A' : '#EEF1F4' }}
      >
      <ViewShift pixels={24} />
      <ambientLight intensity={isDarkMode ? 0.5 : 0.8} />
      <directionalLight position={[6, 10, 4]} intensity={isDarkMode ? 0.8 : 1.1} castShadow />

      <Suspense fallback={null}>
        <Floor
          image={image}
          onDepthReady={setDepth}
          onClick={handleFloorClick}
          onPointerMove={handleFloorPointerMove}
          onPointerLeave={() => setHoverZoneId(null)}
        />
      </Suspense>

      {zones.map(zone => (
        <ZoneBox
          key={zone.id}
          zone={zone}
          color={zoneColors[zone.id] || '#94A3B8'}
          depth={depth}
          isFocused={zone.id === focusZoneId}
          isHovered={zone.id === hoverZoneId}
        />
      ))}

      {placedEquipments.map((eq, idx) => {
        const pos = positions[eq.equipId];
        if (!pos) return null;
        const statusColor = getStatusMeta(metricTab === 'temperature' ? eq.status : eq.powerStatus).color;
        const [sx, , sz] = toWorld(pos.xPct, pos.yPct, depth);
        const hex = STATUS_HEX[statusColor] || STATUS_HEX.green;
        const override = equipmentShapes[eq.equipId];
        const appearDelay = 40 + Math.min(idx, 12) * 35;
        return (
          <React.Fragment key={eq.equipId}>
            <PopIn position={[sx, 0, sz]} rotationY={((override?.rotationY || 0) * Math.PI) / 180} delay={appearDelay} simplified={simplified}>
              {override?.type === 'model' ? (
                <CustomGltfModel modelId={override.modelId} />
              ) : (
                <EquipShape3D shape={override?.type === 'preset' ? override.preset : classifyShape(eq.equipName)} hex={hex} />
              )}
            </PopIn>
            {statusColor === 'red' && !simplified && <AlertRing position={[sx, 0, sz]} />}
            {/* simplified(2D 편집 중 미리보기)에서는 라벨/핀이 좁은 화면에서 너무 크고
                정신없어서 아예 안 그리고, 3D 모양만으로 배치를 확인하게 함 */}
            {!simplified && (
              <EquipMarker
                equip={eq}
                pos={pos}
                depth={depth}
                statusColor={statusColor}
                onSelect={onSelectEquip}
                delay={appearDelay}
              />
            )}
          </React.Fragment>
        );
      })}

        <CameraRig focusKey={`${focusZoneId}:${resetToken}`} focusPos={focusPos} controlsRef={controlsRef} />
        <OrbitControls ref={controlsRef} target={[0, 0, 0]} enableDamping dampingFactor={0.1} minDistance={3} maxDistance={22} maxPolarAngle={Math.PI / 2.1} />
      </Canvas>
    </div>
  );
};

export default PlantMap3DView;
