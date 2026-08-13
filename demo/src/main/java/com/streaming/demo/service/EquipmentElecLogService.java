package com.streaming.demo.service;

import com.streaming.demo.dto.EquipmentElecLogDto;
import com.streaming.demo.entity.EquipmentElecLog;
import com.streaming.demo.entity.EquipmentElecStatus;
import com.streaming.demo.entity.ElecLogClearSetting;
import com.streaming.demo.entity.LogType;
import com.streaming.demo.repository.EquipmentElecLogRepository;
import com.streaming.demo.repository.ElecLogClearSettingRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class EquipmentElecLogService {

    private final EquipmentElecLogRepository logRepository;
    private final ElecLogClearSettingRepository clearSettingRepository;

    public EquipmentElecLogService(EquipmentElecLogRepository logRepository,
                                    ElecLogClearSettingRepository clearSettingRepository) {
        this.logRepository = logRepository;
        this.clearSettingRepository = clearSettingRepository;
    }

    public void recordStatusChange(EquipmentElecStatus eq, String newStatus, LocalDateTime now) {
        LogType type;
        String message;

        switch (newStatus) {
            case "위험" -> {
                type = LogType.WARNING;
                message = eq.getEquipName() + "가 전력 위험 상태입니다. (임계값 초과)";
            }
            case "경고" -> {
                type = LogType.WARNING;
                message = eq.getEquipName() + "가 전력 경고 상태입니다. (임계값 근접)";
            }
            default -> {
                type = LogType.SUCCESS;
                message = eq.getEquipName() + "가 전력 정상 범위로 복구되었습니다.";
            }
        }

        logRepository.save(new EquipmentElecLog(
                type, eq.getEquipId(), eq.getEquipName(), message,
                eq.getPower(), eq.getThreshold(), now));
    }

    public List<EquipmentElecLogDto> getLogsForUser(String userId) {
        LocalDateTime clearedAt = clearSettingRepository.findByUserId(userId)
                .map(ElecLogClearSetting::getClearedAt)
                .orElse(LocalDateTime.of(1970, 1, 1, 0, 0));

        return logRepository.findByCreatedAtAfterOrderByCreatedAtDesc(clearedAt)
                .stream()
                .map(EquipmentElecLogDto::new)
                .collect(Collectors.toList());
    }

    @Transactional
    public void clearLogsForUser(String userId) {
        LocalDateTime now = LocalDateTime.now();
        ElecLogClearSetting setting = clearSettingRepository.findByUserId(userId)
                .orElse(new ElecLogClearSetting(userId, now));
        setting.setClearedAt(now);
        clearSettingRepository.save(setting);
    }
}
