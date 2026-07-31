package com.streaming.demo.controller;

import com.streaming.demo.dto.EquipmentStatusDto;
import com.streaming.demo.service.EquipmentStatusService;

import lombok.RequiredArgsConstructor;

// import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/live/monitoring")
public class EquipmentController {

    // @Autowired
    // private EquipmentStatusService service;
    private final EquipmentStatusService service;

    @GetMapping
    public List<EquipmentStatusDto> getAllEquipment() {
        return service.getAllEquipment();
    }

}