package com.streaming.demo.repository;

import com.streaming.demo.entity.EquipmentTempStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

public interface EquipmentTempStatusRepository extends JpaRepository<EquipmentTempStatus, String> {

    // tick()에서 라이브 값 갱신용: SELECT 없이 PK 기준 단일 행만 UPDATE
    // @Modifying 쿼리는 save()와 달리 활성 트랜잭션이 필요해서 메서드 자체에 @Transactional을 붙임
    // (호출부인 tick()은 private라 서비스에 @Transactional을 붙여도 self-invocation이라 적용 안 됨)
    @Modifying
    @Transactional
    @Query("update EquipmentTempStatus e set e.temperature = :temperature, e.status = :status, e.receivedAt = :receivedAt " +
            "where e.equipId = :equipId")
    void updateLiveValue(@Param("equipId") String equipId, @Param("temperature") Double temperature,
                          @Param("status") String status, @Param("receivedAt") LocalDateTime receivedAt);
}
