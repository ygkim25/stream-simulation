package com.streaming.demo.repository;

import com.streaming.demo.entity.EquipmentTempHistory;
import jakarta.persistence.QueryHint;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.QueryHints;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Stream;

public interface EquipmentTempHistoryRepository extends JpaRepository<EquipmentTempHistory, Long> {
    List<EquipmentTempHistory> findByRecordedAtBetween(LocalDateTime from, LocalDateTime to);
    void deleteByRecordedAtBetween(LocalDateTime from, LocalDateTime to);

    // CSV 내보내기용: 커서 기반 스트리밍 조회 (대량 데이터도 메모리에 한 번에 안 올라오게)
    @QueryHints(@QueryHint(name = "org.hibernate.fetchSize", value = "500"))
    @Query("select h from EquipmentTempHistory h where h.recordedAt between :from and :to order by h.recordedAt asc")
    Stream<EquipmentTempHistory> streamByRecordedAtBetweenOrderByRecordedAtAsc(
            @Param("from") LocalDateTime from, @Param("to") LocalDateTime to);
}
