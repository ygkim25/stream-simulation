package com.streaming.demo.repository;

import com.streaming.demo.entity.EquipmentStatus;
import org.springframework.data.jpa.repository.JpaRepository;

public interface EquipmentStatusRepository extends JpaRepository<EquipmentStatus, String> {
}