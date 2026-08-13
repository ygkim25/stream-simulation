package com.streaming.demo.repository;

import com.streaming.demo.entity.EquipmentTempStatus;
import org.springframework.data.jpa.repository.JpaRepository;

public interface EquipmentTempStatusRepository extends JpaRepository<EquipmentTempStatus, String> {
}
