package com.streaming.demo.repository;

import com.streaming.demo.entity.TempAlertNotificationSetting;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface TempAlertNotificationSettingRepository extends JpaRepository<TempAlertNotificationSetting, Long> {
    Optional<TempAlertNotificationSetting> findByUserId(String userId);
}
