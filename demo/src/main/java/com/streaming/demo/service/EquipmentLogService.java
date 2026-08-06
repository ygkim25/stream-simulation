package com.streaming.demo.service;

import com.streaming.demo.dto.EquipmentLogDto;
import com.streaming.demo.entity.EquipmentLog;
import com.streaming.demo.entity.EquipmentStatus;
import com.streaming.demo.entity.LogClearSetting;
import com.streaming.demo.entity.LogType;
import com.streaming.demo.repository.EquipmentLogRepository;
import com.streaming.demo.repository.LogClearSettingRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class EquipmentLogService {

    private final EquipmentLogRepository logRepository;
    private final LogClearSettingRepository clearSettingRepository;

    public EquipmentLogService(EquipmentLogRepository logRepository,
                                LogClearSettingRepository clearSettingRepository) {
        this.logRepository = logRepository;
        this.clearSettingRepository = clearSettingRepository;
    }

    public void recordStatusChange(EquipmentStatus eq, String newStatus, LocalDateTime now) {
        LogType type;
        String message;

        switch (newStatus) {
            case "Critical" -> {
                type = LogType.WARNING;
                message = eq.getEquipName() + "가 위험 상태입니다. (임계값 초과)";
            }
            case "Warning" -> {
                type = LogType.WARNING;
                message = eq.getEquipName() + "가 경고 상태입니다. (임계값 근접)";
            }
            default -> {
                type = LogType.SUCCESS;
                message = eq.getEquipName() + "가 정상 범위로 복구되었습니다.";
            }
        }

        logRepository.save(new EquipmentLog(
                type, eq.getEquipId(), eq.getEquipName(), message,
                eq.getTemperature(), eq.getThreshold(), now));
    }

    public List<EquipmentLogDto> getLogsForUser(String userId) {
        LocalDateTime clearedAt = clearSettingRepository.findByUserId(userId)
                .map(LogClearSetting::getClearedAt)
                .orElse(LocalDateTime.of(1970, 1, 1, 0, 0));

        return logRepository.findByCreatedAtAfterOrderByCreatedAtDesc(clearedAt)
                .stream()
                .map(EquipmentLogDto::new)
                .collect(Collectors.toList());
    }

    @Transactional
    public void clearLogsForUser(String userId) {
        LocalDateTime now = LocalDateTime.now();
        LogClearSetting setting = clearSettingRepository.findByUserId(userId)
                .orElse(new LogClearSetting(userId, now));
        setting.setClearedAt(now);
        clearSettingRepository.save(setting);
    }
}
