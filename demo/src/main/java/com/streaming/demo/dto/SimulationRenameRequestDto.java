package com.streaming.demo.dto;

public class SimulationRenameRequestDto {
    private Long id;
    private String fileName;

    public SimulationRenameRequestDto() {}

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getFileName() { return fileName; }
    public void setFileName(String fileName) { this.fileName = fileName; }
}
