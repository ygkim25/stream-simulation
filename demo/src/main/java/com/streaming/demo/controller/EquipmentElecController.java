package com.streaming.demo.controller;

import com.streaming.demo.dto.EquipmentElecAlertDto;
import com.streaming.demo.dto.EquipmentElecLogDto;
import com.streaming.demo.dto.EquipmentElecStatusDto;
import com.streaming.demo.service.ElecAlertNotificationSettingService;
import com.streaming.demo.service.EquipmentElecLogService;
import com.streaming.demo.service.EquipmentElecStatusService;

import lombok.RequiredArgsConstructor;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/live/monitoring/elec")
public class EquipmentElecController {

    private final EquipmentElecStatusService service;
    private final ElecAlertNotificationSettingService settingService;
    private final EquipmentElecLogService logService;

    @GetMapping
    public List<EquipmentElecStatusDto> getAllEquipment() {
        return service.getAllEquipment();
    }

    @PutMapping("/update")
    public void updateEquipment(@RequestBody List<EquipmentElecStatusDto> updatedList) {
        service.updateAll(updatedList);
    }

    @GetMapping("/noti-warn")
    public ResponseEntity<List<EquipmentElecAlertDto>> getWarningAlerts(
            @AuthenticationPrincipal String userId) {
        return ResponseEntity.ok(settingService.getAlertsForUser(userId));
    }

    @PostMapping("/noti-warn/clear")
    public ResponseEntity<Map<String, String>> clearAlerts(
            @AuthenticationPrincipal String userId) {
        settingService.clearAlerts(userId);
        return ResponseEntity.ok(Map.of("message", "모든 알림을 지웠습니다."));
    }

    @GetMapping("/logs")
    public ResponseEntity<List<EquipmentElecLogDto>> getAllLogs(
            @AuthenticationPrincipal String userId) {
        return ResponseEntity.ok(logService.getLogsForUser(userId));
    }

    @PostMapping("/logs/clear")
    public ResponseEntity<Map<String, String>> clearLogs(
            @AuthenticationPrincipal String userId) {
        logService.clearLogsForUser(userId);
        return ResponseEntity.ok(Map.of("message", "모든 로그를 지웠습니다."));
    }
}
