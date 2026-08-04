package com.streaming.demo.controller;

import com.streaming.demo.dto.EquipmentAlertDto;
import com.streaming.demo.dto.EquipmentStatusDto;
import com.streaming.demo.entity.EquipmentAlert;
import com.streaming.demo.service.AlertNotificationSettingService;
import com.streaming.demo.service.EquipmentStatusService;

import lombok.RequiredArgsConstructor;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
// import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/live/monitoring")
public class EquipmentController {

    // @Autowired
    // private EquipmentStatusService service;
    private final EquipmentStatusService service;
    private final AlertNotificationSettingService settingService;

    @GetMapping
    public List<EquipmentStatusDto> getAllEquipment() {
        System.out.println("========== EquipmentController ---- getAllEquipment() ==========");
        return service.getAllEquipment();
    }

    @PutMapping("/update")
    public void updateEquipment(@RequestBody List<EquipmentStatusDto> updatedList) {
        System.out.println("========== EquipmentController ---- updateEquipment() ==========");
        service.updateAll(updatedList);
    }

    @GetMapping("/noti-warn")
    public ResponseEntity<List<EquipmentAlertDto>> getWarningAlerts(
            @AuthenticationPrincipal String userId) {
        System.out.println("========== EquipmentController ---- getWarningAlerts() ==========");
        return ResponseEntity.ok(settingService.getAlertsForUser(userId));
    }

    @PostMapping("/noti-warn/clear")
    public ResponseEntity<Map<String, String>> clearAlerts(
            @AuthenticationPrincipal String userId) {
        System.out.println("========== EquipmentController ---- clearAlerts() ==========");
        settingService.clearAlerts(userId);
        return ResponseEntity.ok(Map.of("message", "모든 알림을 지웠습니다."));
    }

}