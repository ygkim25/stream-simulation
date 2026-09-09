package com.streaming.demo.repository;

import com.streaming.demo.entity.ElecLogClearSetting;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ElecLogClearSettingRepository extends JpaRepository<ElecLogClearSetting, Long> {
    Optional<ElecLogClearSetting> findByUserId(String userId);
}
