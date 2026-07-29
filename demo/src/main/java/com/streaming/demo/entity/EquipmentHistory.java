package com.streaming.demo.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "equipment_history")
public class EquipmentHistory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "equip_id")
    private String equipId;

    private Double temperature;
    private Double power;
    private String status;

    @Column(name = "recorded_at")
    private LocalDateTime recordedAt;

    public EquipmentHistory() {}

    public EquipmentHistory(String equipId, Double temperature, Double power,
                             String status, LocalDateTime recordedAt) {
        this.equipId = equipId;
        this.temperature = temperature;
        this.power = power;
        this.status = status;
        this.recordedAt = recordedAt;
    }

    // Getter / Setter
    public Long getId() { return id; }
    public String getEquipId() { return equipId; }
    public Double getTemperature() { return temperature; }
    public Double getPower() { return power; }
    public String getStatus() { return status; }
    public LocalDateTime getRecordedAt() { return recordedAt; }
    public void setEquipId(String equipId) { this.equipId = equipId; }
    public void setTemperature(Double temperature) { this.temperature = temperature; }
    public void setPower(Double power) { this.power = power; }
    public void setStatus(String status) { this.status = status; }
    public void setRecordedAt(LocalDateTime recordedAt) { this.recordedAt = recordedAt; }
}