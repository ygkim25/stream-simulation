package com.streaming.demo.service;

import com.streaming.demo.dto.EquipmentAlertDto;
import com.streaming.demo.entity.AlertNotificationSetting;
import com.streaming.demo.repository.AlertNotificationSettingRepository;
import com.streaming.demo.repository.EquipmentAlertRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class AlertNotificationSettingService {

    private final AlertNotificationSettingRepository settingRepository;
    private final EquipmentAlertRepository alertRepository;

    public AlertNotificationSettingService(AlertNotificationSettingRepository settingRepository,
                                            EquipmentAlertRepository alertRepository) {
        this.settingRepository = settingRepository;
        this.alertRepository = alertRepository;
    }

    @Transactional
    public void clearAlerts(String userId) {
        LocalDateTime now = LocalDateTime.now();
        AlertNotificationSetting setting = settingRepository.findByUserId(userId)
                .orElse(new AlertNotificationSetting(userId, now));
        setting.setClearedAt(now);
        settingRepository.save(setting);
    }

    public List<EquipmentAlertDto> getAlertsForUser(String userId) {
        LocalDateTime clearedAt = settingRepository.findByUserId(userId)
                .map(AlertNotificationSetting::getClearedAt)
                .orElse(LocalDateTime.of(1970, 1, 1, 0, 0));

        return alertRepository.findByRecordedAtAfterOrderByRecordedAtDesc(clearedAt)
                .stream()
                .map(EquipmentAlertDto::new)
                .collect(Collectors.toList());
    }
}