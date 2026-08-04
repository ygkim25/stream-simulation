package com.streaming.demo.repository;

import com.streaming.demo.entity.AlertNotificationSetting;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface AlertNotificationSettingRepository extends JpaRepository<AlertNotificationSetting, Long> {
    Optional<AlertNotificationSetting> findByUserId(String userId);
}