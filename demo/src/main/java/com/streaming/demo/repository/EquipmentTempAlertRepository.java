package com.streaming.demo.repository;

import com.streaming.demo.entity.EquipmentTempAlert;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;

public interface EquipmentTempAlertRepository extends JpaRepository<EquipmentTempAlert, Long> {
    List<EquipmentTempAlert> findByRecordedAtBetween(LocalDateTime from, LocalDateTime to);
    List<EquipmentTempAlert> findByEquipId(String equipId);
    List<EquipmentTempAlert> findByRecordedAtAfterOrderByRecordedAtDesc(LocalDateTime since);
}
