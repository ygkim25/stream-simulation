package com.streaming.demo.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "equipment_elec_alert")
public class EquipmentElecAlert {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "equip_id")
    private String equipId;

    private Double power;
    private Double threshold;
    private String status;

    @Column(name = "recorded_at")
    private LocalDateTime recordedAt;

    public EquipmentElecAlert() {}

    public EquipmentElecAlert(String equipId, Double power, Double threshold,
                               String status, LocalDateTime recordedAt) {
        this.equipId = equipId;
        this.power = power;
        this.threshold = threshold;
        this.status = status;
        this.recordedAt = recordedAt;
    }

    public Long getId() { return id; }
    public String getEquipId() { return equipId; }
    public Double getPower() { return power; }
    public Double getThreshold() { return threshold; }
    public String getStatus() { return status; }
    public LocalDateTime getRecordedAt() { return recordedAt; }
    public void setEquipId(String equipId) { this.equipId = equipId; }
    public void setPower(Double power) { this.power = power; }
    public void setThreshold(Double threshold) { this.threshold = threshold; }
    public void setStatus(String status) { this.status = status; }
    public void setRecordedAt(LocalDateTime recordedAt) { this.recordedAt = recordedAt; }
}
