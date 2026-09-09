package com.streaming.demo.service;

import com.streaming.demo.dto.EquipmentTempAlertDto;
import com.streaming.demo.entity.TempAlertNotificationSetting;
import com.streaming.demo.repository.TempAlertNotificationSettingRepository;
import com.streaming.demo.repository.EquipmentTempAlertRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class TempAlertNotificationSettingService {

    private final TempAlertNotificationSettingRepository settingRepository;
    private final EquipmentTempAlertRepository alertRepository;

    public TempAlertNotificationSettingService(TempAlertNotificationSettingRepository settingRepository,
                                                EquipmentTempAlertRepository alertRepository) {
        this.settingRepository = settingRepository;
        this.alertRepository = alertRepository;
    }

    @Transactional
    public void clearAlerts(String userId) {
        LocalDateTime now = LocalDateTime.now();
        TempAlertNotificationSetting setting = settingRepository.findByUserId(userId)
                .orElse(new TempAlertNotificationSetting(userId, now));
        setting.setClearedAt(now);
        settingRepository.save(setting);
    }

    public List<EquipmentTempAlertDto> getAlertsForUser(String userId) {
        LocalDateTime clearedAt = settingRepository.findByUserId(userId)
                .map(TempAlertNotificationSetting::getClearedAt)
                .orElse(LocalDateTime.of(1970, 1, 1, 0, 0));

        return alertRepository.findByRecordedAtAfterOrderByRecordedAtDesc(clearedAt)
                .stream()
                .map(EquipmentTempAlertDto::new)
                .collect(Collectors.toList());
    }
}
