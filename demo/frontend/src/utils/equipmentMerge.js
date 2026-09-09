// 백엔드가 온도/전력을 완전히 별개 도메인(threshold/status 필드명이 겹침)으로 내려주므로,
// 한 행으로 합칠 때 전력 쪽은 powerThreshold/powerStatus로 이름을 바꿔서 온도 값과 안 섞이게 함
export const EMPTY_EQUIP_ROW = { temperature: null, threshold: null, status: null, power: null, powerThreshold: null, powerStatus: null };

export const mergeTempDto = (row, dto) => ({
  ...row,
  equipId: dto.equipId,
  equipName: dto.equipName,
  location: dto.location,
  receivedAt: dto.receivedAt,
  temperature: dto.temperature,
  threshold: dto.threshold,
  status: dto.status,
});

export const mergeElecDto = (row, dto) => ({
  ...row,
  equipId: dto.equipId,
  equipName: dto.equipName,
  location: dto.location,
  receivedAt: dto.receivedAt,
  power: dto.power,
  powerThreshold: dto.threshold,
  powerStatus: dto.status,
});

// 같은 equipId의 온도/전력 응답 목록을 한 행씩으로 합쳐서 반환 (초기 목록 조회 시 사용)
export const mergeEquipmentLists = (tempList, elecList) => {
  const byId = new Map();
  tempList.forEach(dto => {
    byId.set(dto.equipId, mergeTempDto({ ...EMPTY_EQUIP_ROW }, dto));
  });
  elecList.forEach(dto => {
    const existing = byId.get(dto.equipId) || { ...EMPTY_EQUIP_ROW };
    byId.set(dto.equipId, mergeElecDto(existing, dto));
  });
  return [...byId.values()];
};
