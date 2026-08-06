package com.streaming.demo.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.streaming.demo.entity.EquipmentLog;
import java.time.LocalDateTime;

public class EquipmentLogDto {
    private Long id;
    private String type;
    private String equipId;
    private String equipName;
    private String message;
    private Double value;
    private Double threshold;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createdAt;

    public EquipmentLogDto(EquipmentLog entity) {
        this.id = entity.getId();
        this.type = entity.getType().name().toLowerCase();
        this.equipId = entity.getEquipId();
        this.equipName = entity.getEquipName();
        this.message = entity.getMessage();
        this.value = entity.getValue();
        this.threshold = entity.getThreshold();
        this.createdAt = entity.getCreatedAt();
    }

    public Long getId() { return id; }
    public String getType() { return type; }
    public String getEquipId() { return equipId; }
    public String getEquipName() { return equipName; }
    public String getMessage() { return message; }
    public Double getValue() { return value; }
    public Double getThreshold() { return threshold; }
    public LocalDateTime getCreatedAt() { return createdAt; }
}
