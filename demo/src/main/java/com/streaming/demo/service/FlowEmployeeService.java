package com.streaming.demo.service;

import java.util.List;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import com.streaming.demo.dto.FlowEmployeeApiDto;
import com.streaming.demo.dto.FlowEmployeeWrapperDto;
import com.streaming.demo.entity.FlowEmployee;
import com.streaming.demo.repository.FlowEmployeeRepository;

import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class FlowEmployeeService {

    private static final Logger log = LoggerFactory.getLogger(FlowEmployeeService.class);
    private static final String EXTERNAL_API_URL = "https://api.flow.team/user/employees";

    private final FlowEmployeeRepository employeeRepository;
    private final RestTemplate restTemplate;

    @Value("${flow-api}")
    private String flowApiKey;

    @Transactional
    public void syncEmployees() {
        log.info("조직 구성원 동기화 시작");

        HttpHeaders headers = new HttpHeaders();
        headers.set("x-flow-api-key", flowApiKey);

        HttpEntity<Void> entity = new HttpEntity<>(headers);

        ResponseEntity<FlowEmployeeWrapperDto> response = restTemplate.exchange(
                EXTERNAL_API_URL,
                HttpMethod.GET,
                entity,
                FlowEmployeeWrapperDto.class);

        FlowEmployeeWrapperDto body = response.getBody();

        if (body == null || body.getResponse() == null
                || !body.getResponse().isSuccess()
                || body.getResponse().getData() == null) {
            log.warn("외부 API 응답이 비정상입니다.");
            return;
        }

        List<FlowEmployeeApiDto> employeeList = body.getResponse().getData().getEmployees();

        if (employeeList == null || employeeList.isEmpty()) {
            log.warn("직원 목록이 비어있습니다.");
            return;
        }

        int insertCount = 0;
        int updateCount = 0;
        int skipCount = 0;

        for (FlowEmployeeApiDto dto : employeeList) {
            Optional<FlowEmployee> existingOpt = employeeRepository.findById(dto.getUserId());

            if (existingOpt.isEmpty()) {
                FlowEmployee newEmployee = FlowEmployee.createFrom(dto);
                employeeRepository.save(newEmployee);
                insertCount++;
                continue;
            }

            FlowEmployee existing = existingOpt.get();

            if (existing.isDifferentFrom(dto)) {
                existing.applyApiData(dto);
                employeeRepository.save(existing);
                updateCount++;
            } else {
                skipCount++;
            }
        }

        log.info("동기화 완료 - 신규: {}건, 갱신: {}건, 변경없음: {}건",
                insertCount, updateCount, skipCount);
    }
}
