package com.streaming.demo.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "equipment_temp_history", indexes = {
        @Index(name = "idx_temp_history_recorded_at", columnList = "recorded_at")
})
public class EquipmentTempHistory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "equip_id")
    private String equipId;

    private Double temperature;
    private String status;

    @Column(name = "recorded_at")
    private LocalDateTime recordedAt;

    public EquipmentTempHistory() {}

    public EquipmentTempHistory(String equipId, Double temperature, String status, LocalDateTime recordedAt) {
        this.equipId = equipId;
        this.temperature = temperature;
        this.status = status;
        this.recordedAt = recordedAt;
    }

    public Long getId() { return id; }
    public String getEquipId() { return equipId; }
    public Double getTemperature() { return temperature; }
    public String getStatus() { return status; }
    public LocalDateTime getRecordedAt() { return recordedAt; }
    public void setEquipId(String equipId) { this.equipId = equipId; }
    public void setTemperature(Double temperature) { this.temperature = temperature; }
    public void setStatus(String status) { this.status = status; }
    public void setRecordedAt(LocalDateTime recordedAt) { this.recordedAt = recordedAt; }
}
