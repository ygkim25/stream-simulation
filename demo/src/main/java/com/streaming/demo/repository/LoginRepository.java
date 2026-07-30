package com.streaming.demo.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.streaming.demo.entity.Login;

public interface LoginRepository extends JpaRepository<Login, String> {
    Optional<Login> findByUserId(String userId);
}
