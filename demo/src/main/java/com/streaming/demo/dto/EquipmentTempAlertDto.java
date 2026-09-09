package com.streaming.demo.dto;

import com.streaming.demo.entity.EquipmentTempAlert;
import java.time.LocalDateTime;

public class EquipmentTempAlertDto {
    private String equipId;
    private Double temperature;
    private Double threshold;
    private String status;
    private LocalDateTime recordedAt;

    public EquipmentTempAlertDto(EquipmentTempAlert alert) {
        this.equipId = alert.getEquipId();
        this.temperature = alert.getTemperature();
        this.threshold = alert.getThreshold();
        this.status = alert.getStatus();
        this.recordedAt = alert.getRecordedAt();
    }

    public String getEquipId() { return equipId; }
    public Double getTemperature() { return temperature; }
    public Double getThreshold() { return threshold; }
    public String getStatus() { return status; }
    public LocalDateTime getRecordedAt() { return recordedAt; }
}
