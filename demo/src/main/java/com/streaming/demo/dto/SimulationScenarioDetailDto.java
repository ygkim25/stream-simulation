package com.streaming.demo.dto;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

public class SimulationScenarioDetailDto {
    private Long id;
    private String fileName;
    private String menu;
    private LocalDateTime uploadedAt;
    private List<Map<String, Object>> rows;

    public SimulationScenarioDetailDto() {}

    public SimulationScenarioDetailDto(Long id, String fileName, String menu, LocalDateTime uploadedAt,
                                        List<Map<String, Object>> rows) {
        this.id = id;
        this.fileName = fileName;
        this.menu = menu;
        this.uploadedAt = uploadedAt;
        this.rows = rows;
    }

    public Long getId() { return id; }
    public String getFileName() { return fileName; }
    public String getMenu() { return menu; }
    public LocalDateTime getUploadedAt() { return uploadedAt; }
    public List<Map<String, Object>> getRows() { return rows; }
}
