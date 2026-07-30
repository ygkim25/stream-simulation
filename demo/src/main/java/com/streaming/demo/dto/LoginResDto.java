package com.streaming.demo.dto;

public class LoginResDto {
    private String token;
    private String userId;
    private String userName;
    private String divisionCode;
    private String phone;
    private boolean mustChangePassword;

    public LoginResDto(String token, String userId, String userName, String divisionCode, String phone, boolean mustChangePassword) {
        this.token = token;
        this.userId = userId;
        this.userName = userName;
        this.divisionCode = divisionCode;
        this.phone = phone;
        this.mustChangePassword = mustChangePassword;
    }

    public String getToken() { return token; }
    public String getUserId() { return userId; }
    public String getUserName() { return userName; }
    public String getDivisionCode() { return divisionCode; }
    public String getPhone() { return phone; }
    public boolean isMustChangePassword() { return mustChangePassword; }
}
