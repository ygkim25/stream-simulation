package com.streaming.demo.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "simulation_scenario", indexes = {
        @Index(name = "idx_simulation_scenario_user_id", columnList = "user_id")
})
public class SimulationScenario {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private String userId;

    @Column(name = "file_name", nullable = false)
    private String fileName;

    @Column(name = "uploaded_at", nullable = false)
    private LocalDateTime uploadedAt;

    // 온도/전력 시나리오 구분 ("temp" / "elec"). 기존 업로드본은 마이그레이션으로 "temp" 채워짐
    @Column(name = "menu", length = 10)
    private String menu;

    // TEXT로 명시 (기본 varchar(255)로 매핑되면 대용량 rows 업로드 시 저장 실패함)
    @Column(name = "rows_json", nullable = false, columnDefinition = "TEXT")
    private String rowsJson;

    public SimulationScenario() {}

    public SimulationScenario(String userId, String fileName, String menu, LocalDateTime uploadedAt, String rowsJson) {
        this.userId = userId;
        this.fileName = fileName;
        this.menu = menu;
        this.uploadedAt = uploadedAt;
        this.rowsJson = rowsJson;
    }

    public Long getId() { return id; }
    public String getUserId() { return userId; }
    public String getFileName() { return fileName; }
    public String getMenu() { return menu; }
    public LocalDateTime getUploadedAt() { return uploadedAt; }
    public String getRowsJson() { return rowsJson; }

    public void setFileName(String fileName) { this.fileName = fileName; }
    public void setRowsJson(String rowsJson) { this.rowsJson = rowsJson; }
    public void setUploadedAt(LocalDateTime uploadedAt) { this.uploadedAt = uploadedAt; }
}
