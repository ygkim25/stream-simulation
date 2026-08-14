package com.streaming.demo.controller;

import com.streaming.demo.dto.EquipmentElecAlertDto;
import com.streaming.demo.dto.EquipmentElecLogDto;
import com.streaming.demo.dto.EquipmentElecStatusDto;
import com.streaming.demo.service.ElecAlertNotificationSettingService;
import com.streaming.demo.service.EquipmentElecHistoryExportService;
import com.streaming.demo.service.EquipmentElecLogService;
import com.streaming.demo.service.EquipmentElecStatusService;

import lombok.RequiredArgsConstructor;

import jakarta.servlet.http.HttpServletResponse;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/live/monitoring/elec")
public class EquipmentElecController {

    private final EquipmentElecStatusService service;
    private final ElecAlertNotificationSettingService settingService;
    private final EquipmentElecLogService logService;
    private final EquipmentElecHistoryExportService historyExportService;

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

    // 전력 히스토리 CSV 내보내기 (시작~끝 시간 범위, 오늘/과거 구분 없이 DB에서 스트리밍 조회)
    // HttpServletResponse에 동기적으로 직접 씀 (StreamingResponseBody의 비동기 디스패치를 쓰면
    // 응답 쓰기가 별도 스레드에서 실행되어 Spring Security SecurityContext가 전파되지 않아 거부됨)
    @GetMapping("/history/export")
    public void exportHistory(
            @RequestParam("from") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
            @RequestParam("to") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime to,
            HttpServletResponse response) throws IOException {

        historyExportService.validateRange(from, to);

        String filename = "elec_history_" + from.toLocalDate() + "_" + to.toLocalDate() + ".csv";
        response.setContentType("text/csv; charset=UTF-8");
        response.setHeader("Content-Disposition", "attachment; filename=\"" + filename + "\"");

        try (Writer writer = new OutputStreamWriter(response.getOutputStream(), StandardCharsets.UTF_8)) {
            historyExportService.exportCsv(from, to, writer);
        }
    }
}
