package com.streaming.demo.dto;

// 마이페이지
public class UserInfoDto {
    private String userId;
    private String userName;
    private String phone;
    private String divisionCode;

    public UserInfoDto(String userId, String userName, String phone, String divisionCode) {
        this.userId = userId;
        this.userName = userName;
        this.phone = phone;
        this.divisionCode = divisionCode;
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

}
