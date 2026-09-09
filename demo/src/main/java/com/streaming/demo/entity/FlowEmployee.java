package com.streaming.demo.entity;

import java.time.LocalDateTime;
import java.util.Objects;

import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import com.streaming.demo.dto.FlowEmployeeApiDto;

import jakarta.persistence.*;

@Entity
@Table(name = "employee")
@EntityListeners(AuditingEntityListener.class)
public class FlowEmployee {
    @Id
    @Column(name = "user_id")
    private String userId;

    @Column(name = "user_name")
    private String userName;

    @Column(name = "division_code")
    private String divisionCode;

    @Column(name = "division_name")
    private String divisionName;

    @Column(name = "responsibility")
    private String responsibility;

    @Column(name = "phone")
    private String phone;

    @Column(name = "password")
    private String password;

    @Column(name = "role")
    private String role = "일반";

    @Column(name = "alarm_enable", columnDefinition = "varchar(10) default 'on'")
    private String alarmEnable = "on";

    @CreatedDate
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    public FlowEmployee() {}

    // ── 신규 생성용 (password, role은 안 건드림 → null/DB 기본값) ──
    public static FlowEmployee createFrom(FlowEmployeeApiDto dto) {
        FlowEmployee employee = new FlowEmployee();
        employee.userId = dto.getUserId();
        employee.applyApiData(dto);
        return employee;
    }

    // ── 기존 row에 API 데이터만 반영 (password, role은 절대 안 건드림) ──
    public void applyApiData(FlowEmployeeApiDto dto) {
        this.userName = dto.getFullname();
        this.divisionCode = dto.getDivisionCode();
        this.divisionName = dto.getDivisionName();
        this.responsibility = dto.getResponsibility();
        this.phone = dto.getCellPhoneNumber();
    }

    // ── API 데이터와 현재 값이 다른지 비교 (password, role은 비교 대상 아님) ──
    public boolean isDifferentFrom(FlowEmployeeApiDto dto) {
        return !Objects.equals(this.userName, dto.getFullname())
                || !Objects.equals(this.divisionCode, dto.getDivisionCode())
                || !Objects.equals(this.divisionName, dto.getDivisionName())
                || !Objects.equals(this.responsibility, dto.getResponsibility())
                || !Objects.equals(this.phone, dto.getCellPhoneNumber());
    }

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }

    public String getUserName() { return userName; }
    public void setUserName(String userName) { this.userName = userName; }

    public String getDivisionCode() { return divisionCode; }
    public void setDivisionCode(String divisionCode) { this.divisionCode = divisionCode; }

    public String getDivisionName() { return divisionName; }
    public void setDivisionName(String divisionName) { this.divisionName = divisionName; }

    public String getResponsibility() { return responsibility; }
    public void setResponsibility(String responsibility) { this.responsibility = responsibility; }

    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }

    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }

    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }

    public String getAlarmEnable() { return alarmEnable; }
    public void setAlarmEnable(String alarmEnable) { this.alarmEnable = alarmEnable; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
}
