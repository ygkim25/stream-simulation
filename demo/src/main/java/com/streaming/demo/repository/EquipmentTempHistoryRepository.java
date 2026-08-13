package com.streaming.demo.repository;

import com.streaming.demo.entity.EquipmentTempHistory;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;

public interface EquipmentTempHistoryRepository extends JpaRepository<EquipmentTempHistory, Long> {
    List<EquipmentTempHistory> findByRecordedAtBetween(LocalDateTime from, LocalDateTime to);
    void deleteByRecordedAtBetween(LocalDateTime from, LocalDateTime to);
}
