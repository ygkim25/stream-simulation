package com.streaming.demo.repository;

import com.streaming.demo.entity.SimulationScenarioEdit;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface SimulationScenarioEditRepository extends JpaRepository<SimulationScenarioEdit, Long> {
    List<SimulationScenarioEdit> findByScenarioIdAndEquipIdOrderByEditedAtAsc(Long scenarioId, String equipId);
    void deleteByScenarioId(Long scenarioId);
}
