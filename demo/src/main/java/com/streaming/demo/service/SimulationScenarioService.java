package com.streaming.demo.service;

import tools.jackson.core.JacksonException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;
import com.streaming.demo.dto.SimulationScenarioDetailDto;
import com.streaming.demo.dto.SimulationScenarioSummaryDto;
import com.streaming.demo.entity.SimulationScenario;
import com.streaming.demo.repository.SimulationScenarioRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class SimulationScenarioService {

    private static final TypeReference<List<Map<String, Object>>> ROWS_TYPE = new TypeReference<>() {};

    private final SimulationScenarioRepository repository;
    private final ObjectMapper objectMapper;

    public List<SimulationScenarioSummaryDto> getScenariosForUser(String userId) {
        return repository.findByUserIdOrderByUploadedAtDesc(userId)
                .stream()
                .map(SimulationScenarioSummaryDto::new)
                .collect(Collectors.toList());
    }

    public SimulationScenarioDetailDto getScenarioDetail(Long id, String userId) {
        return toDetail(findOwned(id, userId));
    }

    @Transactional
    public SimulationScenarioDetailDto saveScenario(String userId, String fileName, List<Map<String, Object>> rows) {
        SimulationScenario saved = repository.save(new SimulationScenario(
                userId, fileName, LocalDateTime.now(), writeJson(rows)));
        return toDetail(saved);
    }

    @Transactional
    public SimulationScenarioDetailDto updateScenarioRows(Long id, String userId, List<Map<String, Object>> rows) {
        SimulationScenario s = findOwned(id, userId);
        s.setRowsJson(writeJson(rows));
        return toDetail(s);
    }

    @Transactional
    public void deleteScenario(Long id, String userId) {
        repository.delete(findOwned(id, userId));
    }

    private SimulationScenario findOwned(Long id, String userId) {
        SimulationScenario s = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("시나리오를 찾을 수 없습니다."));
        if (!s.getUserId().equals(userId)) {
            throw new IllegalArgumentException("본인이 업로드한 시나리오만 접근할 수 있습니다.");
        }
        return s;
    }

    private String writeJson(List<Map<String, Object>> rows) {
        try {
            return objectMapper.writeValueAsString(rows);
        } catch (JacksonException e) {
            throw new IllegalArgumentException("rows 데이터를 저장할 수 없습니다.");
        }
    }

    private List<Map<String, Object>> readJson(String json) {
        try {
            return objectMapper.readValue(json, ROWS_TYPE);
        } catch (JacksonException e) {
            throw new IllegalStateException("저장된 rows 데이터를 읽을 수 없습니다.");
        }
    }

    private SimulationScenarioDetailDto toDetail(SimulationScenario s) {
        return new SimulationScenarioDetailDto(
                s.getId(), s.getFileName(), s.getUploadedAt(), readJson(s.getRowsJson()));
    }
}
