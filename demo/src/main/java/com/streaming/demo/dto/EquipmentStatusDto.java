package com.streaming.demo.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.streaming.demo.entity.EquipmentStatus;
import java.time.LocalDateTime;

public class EquipmentStatusDto {
    private String equipId;
    private String equipName;
    private Double temperature;
    private Double power;
    private Double threshold;
    private String status;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime receivedAt;

    public EquipmentStatusDto(EquipmentStatus entity) {
        this.equipId = entity.getEquipId();
        this.equipName = entity.getEquipName();
        this.temperature = entity.getTemperature();
        this.power = entity.getPower();
        this.threshold = entity.getThreshold();
        this.status = entity.getStatus();
        this.receivedAt = entity.getReceivedAt();
    }

    public String getEquipId() {
        return equipId;
    }

    public String getEquipName() {
        return equipName;
    }

    public Double getTemperature() {
        return temperature;
    }

    public Double getPower() {
        return power;
    }

    public Double getThreshold() {
        return threshold;
    }

    public String getStatus() {
        return status;
    }

    public LocalDateTime getReceivedAt() {
        return receivedAt;
    }
}