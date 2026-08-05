package com.streaming.demo.repository;

import com.streaming.demo.entity.EquipmentAlert;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;

public interface EquipmentAlertRepository extends JpaRepository<EquipmentAlert, Long> {
    List<EquipmentAlert> findByRecordedAtBetween(LocalDateTime from, LocalDateTime to);
    List<EquipmentAlert> findByEquipId(String equipId);
    List<EquipmentAlert> findByRecordedAtAfterOrderByRecordedAtDesc(LocalDateTime since);
}
