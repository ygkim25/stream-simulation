package com.streaming.demo.controller;

import com.streaming.demo.dto.EquipmentTempAlertDto;
import com.streaming.demo.dto.EquipmentTempLogDto;
import com.streaming.demo.dto.EquipmentTempStatusDto;
import com.streaming.demo.service.TempAlertNotificationSettingService;
import com.streaming.demo.service.EquipmentTempHistoryExportService;
import com.streaming.demo.service.EquipmentTempLogService;
import com.streaming.demo.service.EquipmentTempStatusService;

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
@RequestMapping("/api/live/monitoring/temp")
public class EquipmentTempController {

    private final EquipmentTempStatusService service;
    private final TempAlertNotificationSettingService settingService;
    private final EquipmentTempLogService logService;
    private final EquipmentTempHistoryExportService historyExportService;

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

    // 온도 히스토리 CSV 내보내기 (시작~끝 시간 범위, 오늘/과거 구분 없이 DB에서 스트리밍 조회)
    // HttpServletResponse에 동기적으로 직접 씀 (StreamingResponseBody의 비동기 디스패치를 쓰면
    // 응답 쓰기가 별도 스레드에서 실행되어 Spring Security SecurityContext가 전파되지 않아 거부됨)
    @GetMapping("/history/export")
    public void exportHistory(
            @RequestParam("from") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
            @RequestParam("to") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime to,
            HttpServletResponse response) throws IOException {

        historyExportService.validateRange(from, to);

        String filename = "temp_history_" + from.toLocalDate() + "_" + to.toLocalDate() + ".csv";
        response.setContentType("text/csv; charset=UTF-8");
        response.setHeader("Content-Disposition", "attachment; filename=\"" + filename + "\"");

        try (Writer writer = new OutputStreamWriter(response.getOutputStream(), StandardCharsets.UTF_8)) {
            historyExportService.exportCsv(from, to, writer);
        }
    }
}
