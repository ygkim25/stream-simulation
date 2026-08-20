package com.streaming.demo.dto;

// 마이페이지
public class UserInfoDto {
    private String userId;
    private String userName;
    private String phone;
    private String divisionCode;
    private String role;
    private String divisionName;
    private String responsibility;
    private String alarmEnable;

    public UserInfoDto(String userId, String userName, String phone, String divisionCode, String role, String divisionName, String responsibility, String alarmEnable) {
        this.userId = userId;
        this.userName = userName;
        this.phone = phone;
        this.divisionCode = divisionCode;
        this.role = role;
        this.divisionName = divisionName;
        this.responsibility = responsibility;
        this.alarmEnable = alarmEnable;
    }

    public String getUserId() {
        return userId;
    }
    public String getUserName() {
        return userName;
    }
    public String getPhone() {
        return phone;
    }
    public String getDivisionCode() {
        return divisionCode;
    }
    public String getRole() {
        return role;
    }
    public String getDivisionName() {
        return divisionName;
    }
    public String getResponsibility() {
        return responsibility;
    }
    public String getAlarmEnable() {
        return alarmEnable;
    }

}
