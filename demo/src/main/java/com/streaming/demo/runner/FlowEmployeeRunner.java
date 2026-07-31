package com.streaming.demo.runner;

import com.streaming.demo.service.FlowEmployeeService;

import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class FlowEmployeeRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(FlowEmployeeRunner.class);

    private final FlowEmployeeService employeeSyncService;

    @Override
    public void run(ApplicationArguments args) {
        try {
            employeeSyncService.syncEmployees();
        } catch (Exception e) {
            log.error("조직 구성원 동기화 실패: {}", e.getMessage());
        }
    }
}