package com.streaming.demo.entity;

import java.time.LocalDateTime;

import jakarta.persistence.*;


@Entity
@Table(name ="employee")
public class Login {
    @Id
    @Column(name = "user_id")
    private String userId;
    @Column(name = "password", length = 255)
    private String password;

    @Column(name = "user_name", length = 50, nullable = false)
    private String userName;

    @Column(name = "division_code", length = 50)
    private String divisionCode;

    @Column(name = "phone", length = 20)
    private String phone;

    @Column(name = "division_name", length = 255)
    private String divisionName;

    @Column(name = "responsibility", length = 255)
    private String responsibility;

    @Column(name = "role", length = 255)
    private String role;
 
    @Column(name = "alarm_enable", length = 10, columnDefinition = "varchar(10) default 'on'")
    private String alarmEnable = "on";

    @Column(name = "must_change_password", nullable = false, columnDefinition = "boolean default false")
    private boolean mustChangePassword = false;

    @Column(name = "temp_password_issued_at")
    private LocalDateTime tempPasswordIssuedAt;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    // getter/setter
    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }

    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }

    public String getUserName() { return userName; }
    public void setUserName(String userName) { this.userName = userName; }

    public String getDivisionCode() { return divisionCode; }
    public void setDivisionCode(String divisionCode) { this.divisionCode = divisionCode; }

    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }

    public String getDivisionName() { return divisionName; }
    public void setDivisionName(String divisionName) { this.divisionName = divisionName; }

    public String getResponsibility() { return responsibility; }
    public void setResponsibility(String responsibility) { this.responsibility = responsibility; }

    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }

    public String getAlarmEnable() { return alarmEnable; }
    public void setAlarmEnable(String alarmEnable) { this.alarmEnable = alarmEnable; }

    public boolean isMustChangePassword() { return mustChangePassword; }
    public void setMustChangePassword(boolean mustChangePassword) { this.mustChangePassword = mustChangePassword; }

    public LocalDateTime getTempPasswordIssuedAt() { return tempPasswordIssuedAt; }
    public void setTempPasswordIssuedAt(LocalDateTime tempPasswordIssuedAt) { this.tempPasswordIssuedAt = tempPasswordIssuedAt; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
}
