package com.streaming.demo.dto;

public class SimulationEditRequestDto {
    private String equipId;
    private long cutoffMs;
    private Double temperature;
    private Double threshold;

    public SimulationEditRequestDto() {}

    public String getEquipId() { return equipId; }
    public void setEquipId(String equipId) { this.equipId = equipId; }

    public long getCutoffMs() { return cutoffMs; }
    public void setCutoffMs(long cutoffMs) { this.cutoffMs = cutoffMs; }

    public Double getTemperature() { return temperature; }
    public void setTemperature(Double temperature) { this.temperature = temperature; }

    public Double getThreshold() { return threshold; }
    public void setThreshold(Double threshold) { this.threshold = threshold; }
}
