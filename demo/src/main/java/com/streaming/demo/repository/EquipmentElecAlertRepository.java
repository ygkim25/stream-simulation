package com.streaming.demo.repository;

import com.streaming.demo.entity.EquipmentElecAlert;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;

public interface EquipmentElecAlertRepository extends JpaRepository<EquipmentElecAlert, Long> {
    List<EquipmentElecAlert> findByRecordedAtBetween(LocalDateTime from, LocalDateTime to);
    List<EquipmentElecAlert> findByEquipId(String equipId);
    List<EquipmentElecAlert> findByRecordedAtAfterOrderByRecordedAtDesc(LocalDateTime since);
}
