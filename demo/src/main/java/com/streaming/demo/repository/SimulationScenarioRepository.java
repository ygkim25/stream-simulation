package com.streaming.demo.repository;

import com.streaming.demo.entity.SimulationScenario;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface SimulationScenarioRepository extends JpaRepository<SimulationScenario, Long> {
    List<SimulationScenario> findByUserIdOrderByUploadedAtDesc(String userId);
}
