package com.streaming.demo.repository;

import com.streaming.demo.entity.ElecAlertNotificationSetting;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ElecAlertNotificationSettingRepository extends JpaRepository<ElecAlertNotificationSetting, Long> {
    Optional<ElecAlertNotificationSetting> findByUserId(String userId);
}
