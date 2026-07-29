// package com.streaming.demo.simulator;

// import com.streaming.demo.dto.EquipmentStatusDto;
// import com.streaming.demo.entity.EquipmentHistory;
// import com.streaming.demo.entity.EquipmentStatus;
// import com.streaming.demo.repository.EquipmentHistoryRepository;
// import com.streaming.demo.repository.EquipmentStatusRepository;
// import jakarta.annotation.PostConstruct;
// import org.springframework.beans.factory.annotation.Autowired;
// import org.springframework.messaging.simp.SimpMessagingTemplate;
// import org.springframework.scheduling.annotation.Scheduled;
// import org.springframework.stereotype.Component;

// import java.time.LocalDateTime;
// import java.util.List;
// import java.util.Map;
// import java.util.concurrent.ConcurrentHashMap;
// import java.util.stream.Collectors;

// @Component
// public class EquipmentSimulator {

//     @Autowired
//     private EquipmentStatusRepository statusRepository;

//     @Autowired
//     private EquipmentHistoryRepository historyRepository;

//     @Autowired
//     private SimpMessagingTemplate messagingTemplate;

//     // DB 원본은 건드리지 않고, 메모리에서만 값을 흔듦 (기준값 유지)
//     private final Map<String, EquipmentStatus> liveData = new ConcurrentHashMap<>();

//     @PostConstruct
//     public void init() {
//         statusRepository.findAll().forEach(eq -> liveData.put(eq.getEquipId(), eq));
//     }

//     @Scheduled(fixedRate = 10000)
//     public void simulateAndBroadcast() {
//         LocalDateTime now = LocalDateTime.now();

//         List<EquipmentStatus> fluctuated = liveData.values().stream()
//                 .map(this::fluctuate)
//                 .collect(Collectors.toList());

//         // 1) 실시간 감지 화면으로 push
//         List<EquipmentStatusDto> dtos = fluctuated.stream()
//                 .map(EquipmentStatusDto::new)
//                 .collect(Collectors.toList());
//         messagingTemplate.convertAndSend("/topic/equipment", dtos);

//         // 2) 이력 테이블에 저장 (기능 2에서 사용할 재생용 로그)
//         List<EquipmentHistory> histories = fluctuated.stream()
//                 .map(eq -> new EquipmentHistory(
//                         eq.getEquipId(), eq.getTemperature(), eq.getPower(),
//                         eq.getStatus(), now))
//                 .collect(Collectors.toList());
//         historyRepository.saveAll(histories);
//     }

//     private EquipmentStatus fluctuate(EquipmentStatus eq) {
//         // 온도: ±1.5 내외로 완만하게 변동
//         double newTemp = round(eq.getTemperature() + (Math.random() - 0.5) * 3.0);
//         // 전력량: ±3 내외로 완만하게 변동
//         double newPower = round(eq.getPower() + (Math.random() - 0.5) * 6.0);

//         eq.setTemperature(newTemp);
//         eq.setPower(newPower);
//         eq.setStatus(determineStatus(newTemp, eq.getThreshold()));
//         eq.setReceivedAt(LocalDateTime.now());

//         return eq;
//     }

//     private String determineStatus(double temperature, double threshold) {
//         if (temperature >= threshold * 1.1) return "위험";
//         if (temperature >= threshold) return "경고";
//         return "정상";
//     }

//     private double round(double value) {
//         return Math.round(value * 100.0) / 100.0;
//     }
// }