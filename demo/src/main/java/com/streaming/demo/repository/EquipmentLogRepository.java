package com.streaming.demo.repository;

import com.streaming.demo.entity.EquipmentLog;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;

public interface EquipmentLogRepository extends JpaRepository<EquipmentLog, Long> {
    List<EquipmentLog> findByCreatedAtAfterOrderByCreatedAtDesc(LocalDateTime clearedAt);
}
