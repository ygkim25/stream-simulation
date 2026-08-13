package com.streaming.demo.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.streaming.demo.entity.EquipmentElecStatus;
import java.time.LocalDateTime;

public class EquipmentElecStatusDto {
    private String equipId;
    private String equipName;
    private Double power;
    private Double threshold;
    private String status;
    private String location;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime receivedAt;

    public EquipmentElecStatusDto() {
    }

    public EquipmentElecStatusDto(EquipmentElecStatus entity) {
        this.equipId = entity.getEquipId();
        this.equipName = entity.getEquipName();
        this.power = entity.getPower();
        this.threshold = entity.getThreshold();
        this.status = entity.getStatus();
        this.receivedAt = entity.getReceivedAt();
        this.location = entity.getLocation();
    }

    public String getEquipId() { return equipId; }
    public void setEquipId(String equipId) { this.equipId = equipId; }

    public String getEquipName() { return equipName; }
    public void setEquipName(String equipName) { this.equipName = equipName; }

    public Double getPower() { return power; }
    public void setPower(Double power) { this.power = power; }

    public Double getThreshold() { return threshold; }
    public void setThreshold(Double threshold) { this.threshold = threshold; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public LocalDateTime getReceivedAt() { return receivedAt; }
    public void setReceivedAt(LocalDateTime receivedAt) { this.receivedAt = receivedAt; }

    public String getLocation() { return location; }
    public void setLocation(String location) { this.location = location; }
}
