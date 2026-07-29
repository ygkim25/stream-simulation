package com.streaming.demo.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class TempController {
  
    @GetMapping
    public String getEquipment() {
        return "Hello";
    }
}
