package com.streaming.demo.repository;

import com.streaming.demo.entity.EquipmentHistory;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;

public interface EquipmentHistoryRepository extends JpaRepository<EquipmentHistory, Long> {
    List<EquipmentHistory> findByRecordedAtBetween(LocalDateTime from, LocalDateTime to);
    void deleteByRecordedAtBetween(LocalDateTime from, LocalDateTime to);
}