package com.streaming.demo.service;

import tools.jackson.core.JacksonException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;
import com.streaming.demo.dto.SimulationEditRequestDto;
import com.streaming.demo.dto.SimulationRenameRequestDto;
import com.streaming.demo.dto.SimulationScenarioDetailDto;
import com.streaming.demo.dto.SimulationScenarioSummaryDto;
import com.streaming.demo.entity.SimulationScenario;
import com.streaming.demo.entity.SimulationScenarioEdit;
import com.streaming.demo.repository.SimulationScenarioEditRepository;
import com.streaming.demo.repository.SimulationScenarioRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class SimulationScenarioService {

    private static final TypeReference<List<Map<String, Object>>> ROWS_TYPE = new TypeReference<>() {};
    // EquipmentStatusService.determineStatus와 동일한 판정 기준(절대 마진) — 시뮬레이션 재생이 실제 운영과 같은 결과를 내도록 맞춤
    private static final double WARNING_MARGIN = 5.0;

    private final SimulationScenarioRepository repository;
    private final SimulationScenarioEditRepository editRepository;
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
    public SimulationScenarioSummaryDto renameScenario(String userId, SimulationRenameRequestDto req) {
        if (req.getFileName() == null || req.getFileName().isBlank()) {
            throw new IllegalArgumentException("파일 이름을 입력해주세요.");
        }
        SimulationScenario s = findOwned(req.getId(), userId);
        s.setFileName(req.getFileName());
        return new SimulationScenarioSummaryDto(s);
    }

    @Transactional
    public void deleteScenario(Long id, String userId) {
        SimulationScenario s = findOwned(id, userId);
        editRepository.deleteByScenarioId(s.getId());
        repository.delete(s);
    }

    // 재생 중 정지 후 편집한 값을 저장. 원본 rows_json은 건드리지 않고 자식 테이블(감사 이력)에만 기록한 뒤,
    // 지금까지 이 설비에 쌓인 편집 전체를 원본 위에 순서대로 재생(replay)해서 "지금 이 세션에서 보여줄 rows"를 계산해 돌려준다.
    // 시나리오를 목록에서 다시 열면(getScenarioDetail) 이 편집 이력은 조회되지 않고 항상 원본이 반환된다.
    @Transactional
    public SimulationScenarioDetailDto applyEdit(Long id, String userId, SimulationEditRequestDto req) {
        SimulationScenario s = findOwned(id, userId);

        editRepository.save(new SimulationScenarioEdit(
                s.getId(), req.getEquipId(), req.getCutoffMs(),
                req.getTemperature(), req.getThreshold(), LocalDateTime.now()));

        List<Map<String, Object>> rows = readJson(s.getRowsJson());
        if (!rows.isEmpty()) {
            long startTimeMs = parseTimeMs(rows.get(0));
            List<SimulationScenarioEdit> edits =
                    editRepository.findByScenarioIdAndEquipIdOrderByEditedAtAsc(s.getId(), req.getEquipId());
            for (SimulationScenarioEdit edit : edits) {
                applyOneEdit(rows, edit, startTimeMs);
            }
        }

        return new SimulationScenarioDetailDto(s.getId(), s.getFileName(), s.getUploadedAt(), rows);
    }

    // cutoff 이후 첫 로우부터 끝까지 새 값 적용 + 상태 재판정 (그 이전 로우는 보존).
    // 다음 로우가 없으면(시나리오 끝부분 편집) 현재 보이는 로우부터 적용해 편집이 무효화되지 않게 함
    private void applyOneEdit(List<Map<String, Object>> rows, SimulationScenarioEdit edit, long startTimeMs) {
        long cutoff = startTimeMs + edit.getCutoffMs();

        Long nextRowTime = null;
        Long visibleRowTime = null;
        for (Map<String, Object> r : rows) {
            if (!edit.getEquipId().equals(String.valueOf(r.get("equipId")))) continue;
            long t = parseTimeMs(r);
            if (t > cutoff) {
                if (nextRowTime == null || t < nextRowTime) nextRowTime = t;
            } else if (visibleRowTime == null || t > visibleRowTime) {
                visibleRowTime = t;
            }
        }
        Long boundary = nextRowTime != null ? nextRowTime : visibleRowTime;
        if (boundary == null) return;

        for (Map<String, Object> r : rows) {
            if (!edit.getEquipId().equals(String.valueOf(r.get("equipId")))) continue;
            if (parseTimeMs(r) < boundary) continue;

            double temperature = edit.getTemperature() != null ? edit.getTemperature() : toDouble(r.get("temperature"));
            double threshold = edit.getThreshold() != null ? edit.getThreshold() : toDouble(r.get("threshold"));
            r.put("temperature", temperature);
            r.put("threshold", threshold);
            r.put("status", determineStatus(temperature, threshold));
        }
    }

    private long parseTimeMs(Map<String, Object> row) {
        return Instant.parse(String.valueOf(row.get("time"))).toEpochMilli();
    }

    private double toDouble(Object value) {
        if (value instanceof Number n) return n.doubleValue();
        return Double.parseDouble(String.valueOf(value));
    }

    // EquipmentStatusService.determineStatus와 동일한 판정 기준(절대 마진)
    private String determineStatus(double temperature, double threshold) {
        if (temperature >= threshold) return "위험";
        if (threshold - temperature < WARNING_MARGIN) return "경고";
        return "정상";
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
