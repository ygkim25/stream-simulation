package com.streaming.demo.repository;

import com.streaming.demo.entity.LogClearSetting;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface LogClearSettingRepository extends JpaRepository<LogClearSetting, Long> {
    Optional<LogClearSetting> findByUserId(String userId);
}
