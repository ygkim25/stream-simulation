package com.streaming.demo.service;

import com.streaming.demo.dto.EquipmentTempStatusDto;
import com.streaming.demo.entity.EquipmentTempAlert;
import com.streaming.demo.entity.EquipmentTempHistory;
import com.streaming.demo.entity.EquipmentTempStatus;
import com.streaming.demo.repository.EquipmentTempAlertRepository;
import com.streaming.demo.repository.EquipmentTempHistoryRepository;
import com.streaming.demo.repository.EquipmentTempStatusRepository;
import jakarta.annotation.PostConstruct;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

// 온도 관제 도메인. 전력(EquipmentElecStatusService)과 완전히 독립된 설비 목록/임계값/알림/로그를 가짐
@Service
@RequiredArgsConstructor
public class EquipmentTempStatusService {

    private static final long MIN_INTERVAL_MS = 3000;
    private static final long MAX_INTERVAL_MS = 15000;
    private static final double WARNING_MARGIN = 5.0; // 임계값과의 차이가 이보다 작으면 "경고"

    private final EquipmentTempStatusRepository repository;
    private final EquipmentTempHistoryRepository historyRepository;
    private final EquipmentTempAlertRepository alertRepository;
    private final EquipmentTempLogService equipmentLogService;
    private final SimpMessagingTemplate messagingTemplate;

    @Qualifier("taskScheduler")
    private final TaskScheduler taskScheduler;

    private final Map<String, EquipmentTempStatus> liveData = new ConcurrentHashMap<>();
    private final Random random = new Random();

    @PostConstruct
    public void init() {
        repository.findAll().forEach(eq -> liveData.put(eq.getEquipId(), eq));
        liveData.keySet().forEach(this::scheduleNext);
    }

    public List<EquipmentTempStatusDto> getAllEquipment() {
        return repository.findAll()
                .stream()
                .map(EquipmentTempStatusDto::new)
                .collect(Collectors.toList());
    }

    // 설비별로 독립적인 다음 tick 예약 (3~15초 랜덤 간격)
    private void scheduleNext(String equipId) {
        long delayMs = MIN_INTERVAL_MS + random.nextInt((int) (MAX_INTERVAL_MS - MIN_INTERVAL_MS + 1));
        taskScheduler.schedule(() -> tick(equipId), Instant.now().plusMillis(delayMs));
    }

    // 설비 1건에 대한 계산 + (변경 시에만) 전송/저장
    private void tick(String equipId) {
        try {
            EquipmentTempStatus eq = liveData.get(equipId);
            if (eq == null) {
                return;
            }

            double oldTemp1d = round1(eq.getTemperature());
            String oldStatus = eq.getStatus();

            double newTemp = round2(eq.getTemperature() + (random.nextDouble() - 0.5) * 3.0);
            eq.setTemperature(newTemp);

            if (round1(newTemp) != oldTemp1d) {
                LocalDateTime now = LocalDateTime.now();
                String newStatus = determineStatus(newTemp, eq.getThreshold());
                eq.setStatus(newStatus);
                eq.setReceivedAt(now);

                messagingTemplate.convertAndSend(
                        "/topic/live/monitoring/temp",
                        List.of(new EquipmentTempStatusDto(eq)));

                historyRepository.save(new EquipmentTempHistory(
                        eq.getEquipId(), eq.getTemperature(), newStatus, now));

                // 정상 → 경고/위험으로 "새로 진입"할 때만 alert/log 기록 (같은 상태가 유지되는 동안은 중복 저장하지 않음)
                boolean isWarningOrCritical = "경고".equals(newStatus) || "위험".equals(newStatus);
                boolean statusChanged = !newStatus.equals(oldStatus);

                if (isWarningOrCritical && statusChanged) {
                    alertRepository.save(new EquipmentTempAlert(
                            eq.getEquipId(), eq.getTemperature(), eq.getThreshold(), newStatus, now));
                }

                if (statusChanged) {
                    equipmentLogService.recordStatusChange(eq, newStatus, now);
                }
            }

            liveData.put(equipId, eq);
        } finally {
            scheduleNext(equipId);
        }
    }

    private String determineStatus(double temperature, double threshold) {
        if (temperature >= threshold)
            return "위험";
        if (threshold - temperature < WARNING_MARGIN)
            return "경고";
        return "정상";
    }

    // 화면 표출 자리수(소수 1자리) 기준 변경 여부 판단용
    private double round1(double value) {
        return Math.round(value * 10.0) / 10.0;
    }

    // DB 저장 자리수(소수 2자리)
    private double round2(double value) {
        return Math.round(value * 100.0) / 100.0;
    }

    // 설비 설정 업데이트 (기존 설비면 수정, 없으면 신규 생성 - upsert)
    @Transactional
    public void updateAll(List<EquipmentTempStatusDto> updatedList) {
        List<String> newEquipIds = new ArrayList<>();

        for (EquipmentTempStatusDto dto : updatedList) {
            if (dto.getEquipId() == null || dto.getEquipId().isBlank()) {
                throw new IllegalArgumentException("설비 ID 값은 필수입니다.");
            }

            EquipmentTempStatus eq = repository.findById(dto.getEquipId()).orElse(null);
            boolean isNew = (eq == null);

            if (isNew) {
                if (dto.getEquipName() == null || dto.getTemperature() == null
                        || dto.getThreshold() == null || dto.getLocation() == null) {
                    throw new IllegalArgumentException(
                            "신규 설비는 장비이름/온도/임계값/위치 값을 모두 입력해야 합니다.");
                }
                eq = new EquipmentTempStatus();
                eq.setEquipId(dto.getEquipId());
            }

            boolean valueOrThresholdChanged = dto.getThreshold() != null || dto.getTemperature() != null;

            if (dto.getEquipName() != null)
                eq.setEquipName(dto.getEquipName());
            if (dto.getLocation() != null)
                eq.setLocation(dto.getLocation());
            if (dto.getThreshold() != null)
                eq.setThreshold(dto.getThreshold());
            if (dto.getTemperature() != null)
                eq.setTemperature(dto.getTemperature());

            // 신규 설비이거나, 기존 설비의 온도/임계값이 바뀐 경우 status/receivedAt을 즉시 재계산
            // (재계산하지 않으면 다음 자동 tick이 표시값을 바꿀 때까지 그리드에 stale 상태가 남음)
            if (isNew || valueOrThresholdChanged) {
                eq.setStatus(determineStatus(eq.getTemperature(), eq.getThreshold()));
                eq.setReceivedAt(LocalDateTime.now());
            }

            if (isNew) {
                newEquipIds.add(eq.getEquipId());
            }

            liveData.put(eq.getEquipId(), eq);
        }

        repository.saveAll(
                updatedList.stream()
                        .map(dto -> liveData.get(dto.getEquipId()))
                        .collect(Collectors.toList()));

        // 신규 설비는 곧바로 독립 tick 루프에 합류
        newEquipIds.forEach(this::scheduleNext);
    }
}
