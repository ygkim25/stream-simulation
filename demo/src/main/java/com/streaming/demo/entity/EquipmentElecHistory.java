package com.streaming.demo.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "equipment_elec_history")
public class EquipmentElecHistory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "equip_id")
    private String equipId;

    private Double power;
    private String status;

    @Column(name = "recorded_at")
    private LocalDateTime recordedAt;

    public EquipmentElecHistory() {}

    public EquipmentElecHistory(String equipId, Double power, String status, LocalDateTime recordedAt) {
        this.equipId = equipId;
        this.power = power;
        this.status = status;
        this.recordedAt = recordedAt;
    }

    public Long getId() { return id; }
    public String getEquipId() { return equipId; }
    public Double getPower() { return power; }
    public String getStatus() { return status; }
    public LocalDateTime getRecordedAt() { return recordedAt; }
    public void setEquipId(String equipId) { this.equipId = equipId; }
    public void setPower(Double power) { this.power = power; }
    public void setStatus(String status) { this.status = status; }
    public void setRecordedAt(LocalDateTime recordedAt) { this.recordedAt = recordedAt; }
}
