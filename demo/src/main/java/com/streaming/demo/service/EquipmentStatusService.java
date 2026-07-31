package com.streaming.demo.service;

import com.streaming.demo.dto.EquipmentStatusDto;
import com.streaming.demo.entity.EquipmentHistory;
import com.streaming.demo.entity.EquipmentStatus;
import com.streaming.demo.repository.EquipmentHistoryRepository;
import com.streaming.demo.repository.EquipmentStatusRepository;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
// import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class EquipmentStatusService {

    private static final Logger log = LoggerFactory.getLogger(EquipmentStatusService.class);

    private final EquipmentStatusRepository repository;
    private final EquipmentHistoryRepository historyRepository;
    private final SimpMessagingTemplate messagingTemplate;

    private final Map<String, EquipmentStatus> liveData = new ConcurrentHashMap<>();

    @PostConstruct
    public void init() {
        repository.findAll().forEach(eq -> liveData.put(eq.getEquipId(), eq));
    }

    public List<EquipmentStatusDto> getAllEquipment() {
        return repository.findAll()
                .stream()
                .map(EquipmentStatusDto::new)
                .collect(Collectors.toList());
    }

    @Scheduled(fixedRate = 10000)
    public void simulateAndBroadcast() {
        LocalDateTime now = LocalDateTime.now();

        List<EquipmentStatus> fluctuated = liveData.values().stream()
                .map(this::fluctuate)
                .collect(Collectors.toList());

        // 로그
        // fluctuated.forEach(eq -> log.info("[{}] {} - 온도:{}, 전력:{}, 상태:{}",
        //         now, eq.getEquipId(), eq.getTemperature(), eq.getPower(), eq.getStatus()));

        List<EquipmentStatusDto> dtos = fluctuated.stream()
                .map(EquipmentStatusDto::new)
                .collect(Collectors.toList());
        messagingTemplate.convertAndSend("/topic/live/monitoring", dtos);

        List<EquipmentHistory> histories = fluctuated.stream()
                .map(eq -> new EquipmentHistory(
                        eq.getEquipId(), eq.getTemperature(), eq.getPower(),
                        eq.getStatus(), now))
                .collect(Collectors.toList());
        historyRepository.saveAll(histories);
    }

    private EquipmentStatus fluctuate(EquipmentStatus eq) {
        double newTemp = round(eq.getTemperature() + (Math.random() - 0.5) * 3.0);
        double newPower = round(eq.getPower() + (Math.random() - 0.5) * 6.0);

        eq.setTemperature(newTemp);
        eq.setPower(newPower);
        eq.setStatus(determineStatus(newTemp, eq.getThreshold()));
        eq.setReceivedAt(LocalDateTime.now());

        return eq;
    }

    private String determineStatus(double temperature, double threshold) {
        if (temperature >= threshold * 1.1) return "위험";
        if (temperature >= threshold) return "경고";
        return "정상";
    }

    private double round(double value) {
        return Math.round(value * 100.0) / 100.0;
    }
}