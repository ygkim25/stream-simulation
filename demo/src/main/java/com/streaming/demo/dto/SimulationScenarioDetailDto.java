package com.streaming.demo.dto;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

public class SimulationScenarioDetailDto {
    private Long id;
    private String fileName;
    private LocalDateTime uploadedAt;
    private List<Map<String, Object>> rows;

    public SimulationScenarioDetailDto() {}

    public SimulationScenarioDetailDto(Long id, String fileName, LocalDateTime uploadedAt,
                                        List<Map<String, Object>> rows) {
        this.id = id;
        this.fileName = fileName;
        this.uploadedAt = uploadedAt;
        this.rows = rows;
    }

    public Long getId() { return id; }
    public String getFileName() { return fileName; }
    public LocalDateTime getUploadedAt() { return uploadedAt; }
    public List<Map<String, Object>> getRows() { return rows; }
}
