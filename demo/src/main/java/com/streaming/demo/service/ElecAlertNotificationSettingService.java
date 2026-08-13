package com.streaming.demo.service;

import com.streaming.demo.dto.EquipmentElecAlertDto;
import com.streaming.demo.entity.ElecAlertNotificationSetting;
import com.streaming.demo.repository.ElecAlertNotificationSettingRepository;
import com.streaming.demo.repository.EquipmentElecAlertRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class ElecAlertNotificationSettingService {

    private final ElecAlertNotificationSettingRepository settingRepository;
    private final EquipmentElecAlertRepository alertRepository;

    public ElecAlertNotificationSettingService(ElecAlertNotificationSettingRepository settingRepository,
                                                EquipmentElecAlertRepository alertRepository) {
        this.settingRepository = settingRepository;
        this.alertRepository = alertRepository;
    }

    @Transactional
    public void clearAlerts(String userId) {
        LocalDateTime now = LocalDateTime.now();
        ElecAlertNotificationSetting setting = settingRepository.findByUserId(userId)
                .orElse(new ElecAlertNotificationSetting(userId, now));
        setting.setClearedAt(now);
        settingRepository.save(setting);
    }

    public List<EquipmentElecAlertDto> getAlertsForUser(String userId) {
        LocalDateTime clearedAt = settingRepository.findByUserId(userId)
                .map(ElecAlertNotificationSetting::getClearedAt)
                .orElse(LocalDateTime.of(1970, 1, 1, 0, 0));

        return alertRepository.findByRecordedAtAfterOrderByRecordedAtDesc(clearedAt)
                .stream()
                .map(EquipmentElecAlertDto::new)
                .collect(Collectors.toList());
    }
}
