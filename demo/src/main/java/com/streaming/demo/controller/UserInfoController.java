package com.streaming.demo.controller;

import com.streaming.demo.dto.UserInfoDto;
import com.streaming.demo.entity.Login;
import com.streaming.demo.repository.LoginRepository;
import com.streaming.demo.security.JwtUtil;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

// import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class UserInfoController {
    private final LoginRepository loginRepository;
    
    private final JwtUtil jwtUtil;

    UserInfoController(LoginRepository loginRepository, JwtUtil jwtUtil) {
        this.loginRepository = loginRepository;
        this.jwtUtil = jwtUtil;
    }

    // 프론트에서 호출 예시
    // const res = await fetch('/api/employee/me', {
    // headers: {
    //     Authorization: `Bearer ${sessionStorage.getItem('token')}`,
    // },
    // });
    // const data = await res.json();
    // console.log(data.phone, data.userId, data.userName);

    @GetMapping("/employee/me")
    public ResponseEntity<?> getMyInfo(@RequestHeader("Authorization") String authHeader) {

        String token = authHeader.replace("Bearer ", "");

        if (!jwtUtil.isTokenValid(token)) {
            return ResponseEntity.status(401).body("인증이 만료되었습니다.");
        }

        String userId = jwtUtil.extractUserId(token);
        var loginOpt = loginRepository.findByUserId(userId);

        if (loginOpt.isEmpty()) {
            return ResponseEntity.status(404).body("사용자를 찾을 수 없습니다.");
        }

        Login login = loginOpt.get();

        // password는 담지 않고, 원하는 필드만 골라서 응답
        UserInfoDto response = new UserInfoDto(
                login.getUserId(),
                login.getUserName(),
                login.getPhone(),
                login.getDivisionCode()
            );

        return ResponseEntity.ok(response);
    }
}
