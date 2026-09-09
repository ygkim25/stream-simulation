package com.streaming.demo.repository;

import com.streaming.demo.entity.TempLogClearSetting;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface TempLogClearSettingRepository extends JpaRepository<TempLogClearSetting, Long> {
    Optional<TempLogClearSetting> findByUserId(String userId);
}
