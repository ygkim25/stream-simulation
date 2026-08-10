package com.streaming.demo.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

// 시뮬레이션 재생 중 저장한 편집 이력 (감사 로그, append-only)
// simulation_scenario.rows_json(원본)은 이 테이블과 무관하게 절대 수정되지 않음
@Entity
@Table(name = "simulation_scenario_edit", indexes = {
        @Index(name = "idx_simulation_scenario_edit_scenario_id", columnList = "scenario_id")
})
public class SimulationScenarioEdit {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "scenario_id", nullable = false)
    private Long scenarioId;

    @Column(name = "equip_id", nullable = false)
    private String equipId;

    @Column(name = "cutoff_ms", nullable = false)
    private long cutoffMs;

    private Double temperature;
    private Double threshold;

    @Column(name = "edited_at", nullable = false)
    private LocalDateTime editedAt;

    public SimulationScenarioEdit() {}

    public SimulationScenarioEdit(Long scenarioId, String equipId, long cutoffMs,
                                   Double temperature, Double threshold, LocalDateTime editedAt) {
        this.scenarioId = scenarioId;
        this.equipId = equipId;
        this.cutoffMs = cutoffMs;
        this.temperature = temperature;
        this.threshold = threshold;
        this.editedAt = editedAt;
    }

    public Long getId() { return id; }
    public Long getScenarioId() { return scenarioId; }
    public String getEquipId() { return equipId; }
    public long getCutoffMs() { return cutoffMs; }
    public Double getTemperature() { return temperature; }
    public Double getThreshold() { return threshold; }
    public LocalDateTime getEditedAt() { return editedAt; }
}
