package com.streaming.demo.repository;

import com.streaming.demo.entity.EquipmentElecHistory;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;

public interface EquipmentElecHistoryRepository extends JpaRepository<EquipmentElecHistory, Long> {
    List<EquipmentElecHistory> findByRecordedAtBetween(LocalDateTime from, LocalDateTime to);
    void deleteByRecordedAtBetween(LocalDateTime from, LocalDateTime to);
}
