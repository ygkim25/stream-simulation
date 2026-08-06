package com.streaming.demo.service;

import com.streaming.demo.dto.EquipmentStatusDto;
import com.streaming.demo.entity.EquipmentAlert;
import com.streaming.demo.entity.EquipmentHistory;
import com.streaming.demo.entity.EquipmentStatus;
import com.streaming.demo.repository.EquipmentAlertRepository;
import com.streaming.demo.repository.EquipmentHistoryRepository;
import com.streaming.demo.repository.EquipmentStatusRepository;
import jakarta.annotation.PostConstruct;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class EquipmentStatusService {

    private static final long MIN_INTERVAL_MS = 3000;
    private static final long MAX_INTERVAL_MS = 15000;

    private final EquipmentStatusRepository repository;
    private final EquipmentHistoryRepository historyRepository;
    private final EquipmentAlertRepository alertRepository;
    private final SimpMessagingTemplate messagingTemplate;

    @Qualifier("taskScheduler")
    private final TaskScheduler taskScheduler;

    private final Map<String, EquipmentStatus> liveData = new ConcurrentHashMap<>();
    private final Random random = new Random();

    @PostConstruct
    public void init() {
        repository.findAll().forEach(eq -> liveData.put(eq.getEquipId(), eq));
        liveData.keySet().forEach(this::scheduleNext);
    }

    public List<EquipmentStatusDto> getAllEquipment() {
        return repository.findAll()
                .stream()
                .map(EquipmentStatusDto::new)
                .collect(Collectors.toList());
    }

    // 설비별로 독립적인 다음 tick 예약 (1~15초 랜덤 간격)
    private void scheduleNext(String equipId) {
        long delayMs = MIN_INTERVAL_MS + random.nextInt((int) (MAX_INTERVAL_MS - MIN_INTERVAL_MS + 1));
        taskScheduler.schedule(() -> tick(equipId), Instant.now().plusMillis(delayMs));
    }

    // 설비 1건에 대한 계산 + (변경 시에만) 전송/저장
    private void tick(String equipId) {
        try {
            EquipmentStatus eq = liveData.get(equipId);
            if (eq == null) {
                return;
            }

            double oldTemp1d = round1(eq.getTemperature());
            String oldStatus = eq.getStatus();

            double newTemp = round2(eq.getTemperature() + (random.nextDouble() - 0.5) * 3.0);
            double newPower = round2(eq.getPower() + (random.nextDouble() - 0.5) * 6.0);
            eq.setTemperature(newTemp);
            eq.setPower(newPower);

            if (round1(newTemp) != oldTemp1d) {
                LocalDateTime now = LocalDateTime.now();
                String newStatus = determineStatus(newTemp, eq.getThreshold());
                eq.setStatus(newStatus);
                eq.setReceivedAt(now);

                messagingTemplate.convertAndSend(
                        "/topic/live/monitoring",
                        List.of(new EquipmentStatusDto(eq)));

                historyRepository.save(new EquipmentHistory(
                        eq.getEquipId(), eq.getTemperature(), eq.getPower(), eq.getStatus(), now));

                // 정상 → 경고/위험으로 "새로 진입"할 때만 알림 기록 (같은 경고 상태가 유지되는 동안은 중복 저장하지 않음)
                boolean isWarningOrDanger = "경고".equals(newStatus) || "위험".equals(newStatus);
                boolean statusChanged = !newStatus.equals(oldStatus);
                if (isWarningOrDanger && statusChanged) {
                    alertRepository.save(new EquipmentAlert(
                            eq.getEquipId(), eq.getTemperature(), eq.getPower(),
                            eq.getThreshold(), eq.getStatus(), now));
                }
            }

            liveData.put(equipId, eq);
        } finally {
            scheduleNext(equipId);
        }
    }

    private String determineStatus(double temperature, double threshold) {
        if (temperature >= threshold * 1.1)
            return "위험";
        if (temperature >= threshold)
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

    // 설비 설정 업데이트
    @Transactional
    public void updateAll(List<EquipmentStatusDto> updatedList) {
        for (EquipmentStatusDto dto : updatedList) {
            if (dto.getEquipId() == null || dto.getEquipId().isBlank()) {
                throw new IllegalArgumentException("설비 ID 값은 필수입니다.");
            }
            EquipmentStatus eq = repository.findById(dto.getEquipId())
                    .orElseThrow(() -> new IllegalArgumentException(
                            dto.getEquipId() + " 설비를 찾을 수 없습니다."));

            if (dto.getEquipName() != null)
                eq.setEquipName(dto.getEquipName());
            if (dto.getLocation() != null)
                eq.setLocation(dto.getLocation()); // location 필드 추가 후
            if (dto.getThreshold() != null)
                eq.setThreshold(dto.getThreshold());
            // temperature, power, status는 body에 없으면 건드리지 않음 → 기존 값 유지

            liveData.put(eq.getEquipId(), eq);
        }

        repository.saveAll(
                updatedList.stream()
                        .map(dto -> liveData.get(dto.getEquipId()))
                        .collect(Collectors.toList()));
    }
}