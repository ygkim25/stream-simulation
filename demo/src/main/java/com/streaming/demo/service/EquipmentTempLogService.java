package com.streaming.demo.service;

import com.streaming.demo.dto.EquipmentTempLogDto;
import com.streaming.demo.entity.EquipmentTempLog;
import com.streaming.demo.entity.EquipmentTempStatus;
import com.streaming.demo.entity.TempLogClearSetting;
import com.streaming.demo.entity.LogType;
import com.streaming.demo.repository.EquipmentTempLogRepository;
import com.streaming.demo.repository.TempLogClearSettingRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class EquipmentTempLogService {

    private final EquipmentTempLogRepository logRepository;
    private final TempLogClearSettingRepository clearSettingRepository;

    public EquipmentTempLogService(EquipmentTempLogRepository logRepository,
                                    TempLogClearSettingRepository clearSettingRepository) {
        this.logRepository = logRepository;
        this.clearSettingRepository = clearSettingRepository;
    }

    public void recordStatusChange(EquipmentTempStatus eq, String newStatus, LocalDateTime now) {
        LogType type;
        String message;

        switch (newStatus) {
            case "위험" -> {
                type = LogType.WARNING;
                message = eq.getEquipName() + "가 온도 위험 상태입니다. (임계값 초과)";
            }
            case "경고" -> {
                type = LogType.WARNING;
                message = eq.getEquipName() + "가 온도 경고 상태입니다. (임계값 근접)";
            }
            default -> {
                type = LogType.SUCCESS;
                message = eq.getEquipName() + "가 온도 정상 범위로 복구되었습니다.";
            }
        }

        logRepository.save(new EquipmentTempLog(
                type, eq.getEquipId(), eq.getEquipName(), message,
                eq.getTemperature(), eq.getThreshold(), now));
    }

    public List<EquipmentTempLogDto> getLogsForUser(String userId) {
        LocalDateTime clearedAt = clearSettingRepository.findByUserId(userId)
                .map(TempLogClearSetting::getClearedAt)
                .orElse(LocalDateTime.of(1970, 1, 1, 0, 0));

        return logRepository.findByCreatedAtAfterOrderByCreatedAtDesc(clearedAt)
                .stream()
                .map(EquipmentTempLogDto::new)
                .collect(Collectors.toList());
    }

    @Transactional
    public void clearLogsForUser(String userId) {
        LocalDateTime now = LocalDateTime.now();
        TempLogClearSetting setting = clearSettingRepository.findByUserId(userId)
                .orElse(new TempLogClearSetting(userId, now));
        setting.setClearedAt(now);
        clearSettingRepository.save(setting);
    }
}
