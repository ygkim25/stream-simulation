package com.streaming.demo.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "equipment_status")
public class EquipmentStatus {

    @Id
    @Column(name = "equip_id")
    private String equipId;

    @Column(name = "equip_name")
    private String equipName;

    private Double temperature;
    private Double power;
    private Double threshold;
    private String status;

    @Column(name = "received_at")
    private LocalDateTime receivedAt;

    public EquipmentStatus() {}

    public String getEquipId() { return equipId; }
    public void setEquipId(String equipId) { this.equipId = equipId; }

    public String getEquipName() { return equipName; }
    public void setEquipName(String equipName) { this.equipName = equipName; }

    public Double getTemperature() { return temperature; }
    public void setTemperature(Double temperature) { this.temperature = temperature; }

    public Double getPower() { return power; }
    public void setPower(Double power) { this.power = power; }

    public Double getThreshold() { return threshold; }
    public void setThreshold(Double threshold) { this.threshold = threshold; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public LocalDateTime getReceivedAt() { return receivedAt; }
    public void setReceivedAt(LocalDateTime receivedAt) { this.receivedAt = receivedAt; }
}