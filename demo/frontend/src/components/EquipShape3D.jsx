// 설비 3D 모양 프리셋 컴포넌트 - 상수/분류 함수는 utils/equipShapePresets.js에 분리돼 있음
// (Fast Refresh가 컴포넌트 전용 파일에서만 제대로 동작해서)
const METAL = '#94A3B8';

// 상태색은 몸체에, 프레임/받침 등 부속은 중립 금속색으로 - 클릭/호버는 없는 순수 장식용 메시
const EquipShape3D = ({ shape, hex }) => {
  switch (shape) {
    case 'conveyor':
      return (
        <group>
          <mesh position={[0, 0.14, 0]}>
            <boxGeometry args={[0.9, 0.06, 0.26]} />
            <meshStandardMaterial color={hex} />
          </mesh>
          {[-0.4, 0.4].map((ox) => (
            <mesh key={ox} position={[ox, 0.08, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.08, 0.08, 0.3, 12]} />
              <meshStandardMaterial color={METAL} />
            </mesh>
          ))}
        </group>
      );
    case 'pump':
      return (
        <group>
          <mesh position={[0, 0.1, 0]}>
            <boxGeometry args={[0.3, 0.2, 0.3]} />
            <meshStandardMaterial color={METAL} />
          </mesh>
          <mesh position={[0, 0.28, 0]}>
            <cylinderGeometry args={[0.1, 0.1, 0.18, 16]} />
            <meshStandardMaterial color={hex} />
          </mesh>
        </group>
      );
    case 'compressor':
      return (
        <group>
          <mesh position={[0, 0.08, 0]}>
            <boxGeometry args={[0.5, 0.08, 0.3]} />
            <meshStandardMaterial color={METAL} />
          </mesh>
          <mesh position={[0, 0.24, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.14, 0.14, 0.5, 16]} />
            <meshStandardMaterial color={hex} />
          </mesh>
        </group>
      );
    case 'tank':
      return (
        <mesh position={[0, 0.3, 0]}>
          <cylinderGeometry args={[0.18, 0.18, 0.6, 20]} />
          <meshStandardMaterial color={hex} />
        </mesh>
      );
    case 'transformer':
      return (
        <group>
          <mesh position={[0, 0.15, 0]}>
            <boxGeometry args={[0.4, 0.3, 0.3]} />
            <meshStandardMaterial color={hex} />
          </mesh>
          {[-0.1, 0, 0.1].map((ox) => (
            <mesh key={ox} position={[ox, 0.38, 0]}>
              <cylinderGeometry args={[0.02, 0.02, 0.16, 8]} />
              <meshStandardMaterial color={METAL} />
            </mesh>
          ))}
        </group>
      );
    case 'fan':
      return (
        <group>
          <mesh position={[0, 0.15, 0]}>
            <boxGeometry args={[0.1, 0.3, 0.1]} />
            <meshStandardMaterial color={METAL} />
          </mesh>
          <mesh position={[0, 0.32, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.2, 0.2, 0.04, 24]} />
            <meshStandardMaterial color={hex} />
          </mesh>
        </group>
      );
    case 'robot':
      return (
        <group>
          <mesh position={[0, 0.08, 0]}>
            <boxGeometry args={[0.2, 0.16, 0.2]} />
            <meshStandardMaterial color={METAL} />
          </mesh>
          <mesh position={[0, 0.28, 0]} rotation={[0, 0, 0.5]}>
            <boxGeometry args={[0.08, 0.32, 0.08]} />
            <meshStandardMaterial color={hex} />
          </mesh>
        </group>
      );
    case 'dust':
      return (
        <group>
          <mesh position={[0, 0.18, 0]}>
            <cylinderGeometry args={[0.16, 0.16, 0.3, 16]} />
            <meshStandardMaterial color={METAL} />
          </mesh>
          <mesh position={[0, 0.4, 0]}>
            <coneGeometry args={[0.16, 0.2, 16]} />
            <meshStandardMaterial color={hex} />
          </mesh>
        </group>
      );
    default:
      return (
        <mesh position={[0, 0.12, 0]}>
          <boxGeometry args={[0.24, 0.24, 0.24]} />
          <meshStandardMaterial color={hex} />
        </mesh>
      );
  }
};

export default EquipShape3D;
