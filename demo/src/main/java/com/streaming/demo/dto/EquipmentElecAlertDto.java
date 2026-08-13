package com.streaming.demo.dto;

import com.streaming.demo.entity.EquipmentElecAlert;
import java.time.LocalDateTime;

public class EquipmentElecAlertDto {
    private String equipId;
    private Double power;
    private Double threshold;
    private String status;
    private LocalDateTime recordedAt;

    public EquipmentElecAlertDto(EquipmentElecAlert alert) {
        this.equipId = alert.getEquipId();
        this.power = alert.getPower();
        this.threshold = alert.getThreshold();
        this.status = alert.getStatus();
        this.recordedAt = alert.getRecordedAt();
    }

    public String getEquipId() { return equipId; }
    public Double getPower() { return power; }
    public Double getThreshold() { return threshold; }
    public String getStatus() { return status; }
    public LocalDateTime getRecordedAt() { return recordedAt; }
}
