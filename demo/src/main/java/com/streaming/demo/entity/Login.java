package com.streaming.demo.entity;

import java.time.LocalDateTime;

import jakarta.persistence.*;


@Entity
@Table(name ="employee")
public class Login {
    @Id
    @Column(name = "user_id")
    private String userId;
    @Column(name = "password", length = 255, nullable = false)
    private String password;

    @Column(name = "user_name", length = 50, nullable = false)
    private String userName;

    @Column(name = "division_code", length = 50)
    private String divisionCode;

    @Column(name = "phone", length = 20)
    private String phone;

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

    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
}
