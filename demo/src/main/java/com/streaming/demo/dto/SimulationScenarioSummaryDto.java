package com.streaming.demo.dto;

import com.streaming.demo.entity.SimulationScenario;
import java.time.LocalDateTime;

public class SimulationScenarioSummaryDto {
    private Long id;
    private String fileName;
    private String menu;
    private LocalDateTime uploadedAt;

    public SimulationScenarioSummaryDto() {}

    public SimulationScenarioSummaryDto(SimulationScenario entity) {
        this.id = entity.getId();
        this.fileName = entity.getFileName();
        this.menu = entity.getMenu();
        this.uploadedAt = entity.getUploadedAt();
    }

    public Long getId() { return id; }
    public String getFileName() { return fileName; }
    public String getMenu() { return menu; }
    public LocalDateTime getUploadedAt() { return uploadedAt; }
}
