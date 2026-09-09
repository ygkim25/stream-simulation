package com.streaming.demo.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "equipment_elec_log")
public class EquipmentElecLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(name = "type", nullable = false, length = 20)
    private LogType type;

    @Column(name = "equip_id")
    private String equipId;

    @Column(name = "equip_name")
    private String equipName;

    @Column(name = "message", nullable = false, length = 500)
    private String message;

    private Double value;
    private Double threshold;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    public EquipmentElecLog() {}

    public EquipmentElecLog(LogType type, String equipId, String equipName, String message,
                             Double value, Double threshold, LocalDateTime createdAt) {
        this.type = type;
        this.equipId = equipId;
        this.equipName = equipName;
        this.message = message;
        this.value = value;
        this.threshold = threshold;
        this.createdAt = createdAt;
    }

    public Long getId() { return id; }
    public LogType getType() { return type; }
    public String getEquipId() { return equipId; }
    public String getEquipName() { return equipName; }
    public String getMessage() { return message; }
    public Double getValue() { return value; }
    public Double getThreshold() { return threshold; }
    public LocalDateTime getCreatedAt() { return createdAt; }
}
