package com.streaming.demo.repository;

import com.streaming.demo.entity.EquipmentElecLog;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;

public interface EquipmentElecLogRepository extends JpaRepository<EquipmentElecLog, Long> {
    List<EquipmentElecLog> findByCreatedAtAfterOrderByCreatedAtDesc(LocalDateTime clearedAt);
}
