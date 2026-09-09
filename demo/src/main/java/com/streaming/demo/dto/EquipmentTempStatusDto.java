package com.streaming.demo.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.streaming.demo.entity.EquipmentTempStatus;
import java.time.LocalDateTime;

public class EquipmentTempStatusDto {
    private String equipId;
    private String equipName;
    private Double temperature;
    private Double threshold;
    private String status;
    private String location;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime receivedAt;

    public EquipmentTempStatusDto() {
    }

    public EquipmentTempStatusDto(EquipmentTempStatus entity) {
        this.equipId = entity.getEquipId();
        this.equipName = entity.getEquipName();
        this.temperature = entity.getTemperature();
        this.threshold = entity.getThreshold();
        this.status = entity.getStatus();
        this.receivedAt = entity.getReceivedAt();
        this.location = entity.getLocation();
    }

    public String getEquipId() { return equipId; }
    public void setEquipId(String equipId) { this.equipId = equipId; }

    public String getEquipName() { return equipName; }
    public void setEquipName(String equipName) { this.equipName = equipName; }

    public Double getTemperature() { return temperature; }
    public void setTemperature(Double temperature) { this.temperature = temperature; }

    public Double getThreshold() { return threshold; }
    public void setThreshold(Double threshold) { this.threshold = threshold; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public LocalDateTime getReceivedAt() { return receivedAt; }
    public void setReceivedAt(LocalDateTime receivedAt) { this.receivedAt = receivedAt; }

    public String getLocation() { return location; }
    public void setLocation(String location) { this.location = location; }
}
