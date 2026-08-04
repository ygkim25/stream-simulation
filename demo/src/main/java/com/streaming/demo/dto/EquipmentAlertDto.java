package com.streaming.demo.dto;

import com.streaming.demo.entity.EquipmentAlert;
import java.time.LocalDateTime;

public class EquipmentAlertDto {
    private String equipId;
    private Double temperature;
    private Double power;
    private Double threshold;
    private String status;
    private LocalDateTime recordedAt;

    public EquipmentAlertDto(EquipmentAlert alert) {
        this.equipId = alert.getEquipId();
        this.temperature = alert.getTemperature();
        this.power = alert.getPower();
        this.threshold = alert.getThreshold();
        this.status = alert.getStatus();
        this.recordedAt = alert.getRecordedAt();
    }

    public String getEquipId() { return equipId; }
    public Double getTemperature() { return temperature; }
    public Double getPower() { return power; }
    public Double getThreshold() { return threshold; }
    public String getStatus() { return status; }
    public LocalDateTime getRecordedAt() { return recordedAt; }
}