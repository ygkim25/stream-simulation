package com.streaming.demo.repository;

import com.streaming.demo.entity.EquipmentTempLog;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;

public interface EquipmentTempLogRepository extends JpaRepository<EquipmentTempLog, Long> {
    List<EquipmentTempLog> findByCreatedAtAfterOrderByCreatedAtDesc(LocalDateTime clearedAt);
}
