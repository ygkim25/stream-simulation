package com.streaming.demo.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "alert_notification_setting")
public class AlertNotificationSetting {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false, unique = true)
    private String userId;

    @Column(name = "cleared_at", nullable = false)
    private LocalDateTime clearedAt;

    public AlertNotificationSetting() {}

    public AlertNotificationSetting(String userId, LocalDateTime clearedAt) {
        this.userId = userId;
        this.clearedAt = clearedAt;
    }

    public Long getId() { return id; }
    public String getUserId() { return userId; }
    public LocalDateTime getClearedAt() { return clearedAt; }
    public void setClearedAt(LocalDateTime clearedAt) { this.clearedAt = clearedAt; }
}