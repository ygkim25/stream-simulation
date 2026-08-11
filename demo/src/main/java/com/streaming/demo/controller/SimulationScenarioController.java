package com.streaming.demo.controller;

import com.streaming.demo.dto.SimulationEditRequestDto;
import com.streaming.demo.dto.SimulationRenameRequestDto;
import com.streaming.demo.dto.SimulationScenarioDetailDto;
import com.streaming.demo.dto.SimulationScenarioSummaryDto;
import com.streaming.demo.service.SimulationScenarioService;

import lombok.RequiredArgsConstructor;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/simulation/scenarios")
public class SimulationScenarioController {

    private final SimulationScenarioService service;

    @GetMapping
    public List<SimulationScenarioSummaryDto> list(@AuthenticationPrincipal String userId) {
        return service.getScenariosForUser(userId);
    }

    @GetMapping("/{id}")
    public SimulationScenarioDetailDto detail(@PathVariable("id") Long id,
                                               @AuthenticationPrincipal String userId) {
        return service.getScenarioDetail(id, userId);
    }

    @PostMapping
    public SimulationScenarioDetailDto upload(@RequestBody SimulationScenarioDetailDto request,
                                               @AuthenticationPrincipal String userId) {
        return service.saveScenario(userId, request.getFileName(), request.getRows());
    }

    @PutMapping("/{id}")
    public SimulationScenarioDetailDto update(@PathVariable("id") Long id,
                                               @RequestBody SimulationScenarioDetailDto request,
                                               @AuthenticationPrincipal String userId) {
        return service.updateScenarioRows(id, userId, request.getRows());
    }

    // 재생 중 정지 후 값 편집 저장. 원본 rows_json은 안 건드리고 편집 이력만 기록한 뒤,
    // 지금까지의 편집을 원본 위에 재생(replay)한 결과를 돌려줘서 그 세션의 재생에 반영되게 함.
    // 시나리오를 목록에서 다시 열면(GET /{id}) 이 편집은 보이지 않고 원본 그대로 조회됨.
    @PatchMapping("/{id}/edit")
    public SimulationScenarioDetailDto edit(@PathVariable("id") Long id,
                                             @RequestBody SimulationEditRequestDto request,
                                             @AuthenticationPrincipal String userId) {
        return service.applyEdit(id, userId, request);
    }

    // 시나리오 이름 변경. id를 path가 아닌 body로 받음 (요청하신 스펙)
    @PatchMapping("/rename")
    public SimulationScenarioSummaryDto rename(@RequestBody SimulationRenameRequestDto request,
                                                @AuthenticationPrincipal String userId) {
        return service.renameScenario(userId, request);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable("id") Long id,
                                        @AuthenticationPrincipal String userId) {
        service.deleteScenario(id, userId);
        return ResponseEntity.noContent().build();
    }
}
