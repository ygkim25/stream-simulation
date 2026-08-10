package com.streaming.demo.controller;

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

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable("id") Long id,
                                        @AuthenticationPrincipal String userId) {
        service.deleteScenario(id, userId);
        return ResponseEntity.noContent().build();
    }
}
