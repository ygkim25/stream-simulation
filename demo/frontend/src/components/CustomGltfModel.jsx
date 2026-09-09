import React, { Suspense, useEffect, useState } from 'react';
import { useGLTF, Center } from '@react-three/drei';
import { getModelBlob } from '../utils/plantMapModelsDb';

// 업로드된 커스텀 GLB 모델을 IndexedDB에서 Blob으로 읽어와 임시 URL로 로드함.
// 배치도(PlantMap3DView)와 모양 설정 패널의 미리보기(EquipShapePanel)에서 같이 씀.
// center를 컴포넌트 바깥(부모)에서 감싸면 useGLTF가 Suspense로 아직 로딩 중일 때(빈 상태) 먼저
// 계산돼버려서 실제 모델이 뜬 뒤에도 안 맞았음(미리보기가 위로 치우쳐 보이던 원인) - 그래서
// 모델이 실제로 준비된 뒤에만 렌더되는 이 안쪽에서 Center를 적용함
const GltfModel = ({ url, scale = 0.3, center = false }) => {
  const { scene } = useGLTF(url);
  const content = <primitive object={scene} scale={scale} />;
  return center ? <Center>{content}</Center> : content;
};

const CustomGltfModel = ({ modelId, scale, center = false }) => {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let objectUrl = null;
    let cancelled = false;
    getModelBlob(modelId).then(record => {
      if (cancelled || !record) return;
      objectUrl = URL.createObjectURL(record.blob);
      setUrl(objectUrl);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [modelId]);

  if (!url) return null;
  return (
    <Suspense fallback={null}>
      <GltfModel url={url} scale={scale} center={center} />
    </Suspense>
  );
};

export default CustomGltfModel;
