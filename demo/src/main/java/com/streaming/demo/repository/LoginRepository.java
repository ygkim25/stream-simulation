package com.streaming.demo.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.streaming.demo.entity.Login;

public interface LoginRepository extends JpaRepository<Login, String> {
    Optional<Login> findByUserId(String userId);
    List<Login> findByRoleIgnoreCase(String role);
    List<Login> findByRoleIgnoreCaseAndAlarmEnableIgnoreCase(String role, String alarmEnable);
}
