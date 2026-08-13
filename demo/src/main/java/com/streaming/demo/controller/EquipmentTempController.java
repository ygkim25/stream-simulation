package com.streaming.demo.controller;

import com.streaming.demo.dto.EquipmentTempAlertDto;
import com.streaming.demo.dto.EquipmentTempLogDto;
import com.streaming.demo.dto.EquipmentTempStatusDto;
import com.streaming.demo.service.TempAlertNotificationSettingService;
import com.streaming.demo.service.EquipmentTempLogService;
import com.streaming.demo.service.EquipmentTempStatusService;

import lombok.RequiredArgsConstructor;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/live/monitoring/temp")
public class EquipmentTempController {

    private final EquipmentTempStatusService service;
    private final TempAlertNotificationSettingService settingService;
    private final EquipmentTempLogService logService;

    @GetMapping
    public List<EquipmentTempStatusDto> getAllEquipment() {
        return service.getAllEquipment();
    }

    @PutMapping("/update")
    public void updateEquipment(@RequestBody List<EquipmentTempStatusDto> updatedList) {
        service.updateAll(updatedList);
    }

    @GetMapping("/noti-warn")
    public ResponseEntity<List<EquipmentTempAlertDto>> getWarningAlerts(
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
    public ResponseEntity<List<EquipmentTempLogDto>> getAllLogs(
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
