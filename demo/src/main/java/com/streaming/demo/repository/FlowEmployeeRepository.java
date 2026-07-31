package com.streaming.demo.repository;

import org.springframework.data.jpa.repository.JpaRepository;

import com.streaming.demo.entity.FlowEmployee;

public interface FlowEmployeeRepository extends JpaRepository<FlowEmployee, String> {

}
