package com.streaming.demo.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.streaming.demo.dto.LoginReqDto;
import com.streaming.demo.dto.LoginResDto;
import com.streaming.demo.entity.Login;
import com.streaming.demo.repository.LoginRepository;
import com.streaming.demo.security.JwtUtil;

@RestController
@RequestMapping("/api/auth")
public class LoginController {
    private final LoginRepository loginRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;

    
    public LoginController(LoginRepository loginRepository,
                           PasswordEncoder passwordEncoder,
                           JwtUtil jwtUtil) {
        this.loginRepository = loginRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtUtil = jwtUtil;
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody LoginReqDto request) {
        var loginOpt = loginRepository.findByUserId(request.getUserId());

        if (loginOpt.isEmpty()) {
            return ResponseEntity.status(401).body("아이디 또는 비밀번호가 일치하지 않습니다.");
        }

        Login login = loginOpt.get();
        boolean mustChangePassword;

        if(login.getPassword() == null || login.getPassword().isBlank()) {
            if(!"12345".equals(request.getPassword())){
                return ResponseEntity.status(401).body("아이디 또는 비밀번호가 일치하지 않습니다.");
            }
            mustChangePassword = true;
        } else {
            if (!passwordEncoder.matches(request.getPassword(), login.getPassword())) {
                return ResponseEntity.status(401).body("아이디 또는 비밀번호가 일치하지 않습니다.");
            }
            mustChangePassword = false;
        }


        String token = jwtUtil.generateToken(login.getUserId());

        return ResponseEntity.ok(new LoginResDto(
                token, login.getUserId(), login.getUserName(), login.getDivisionCode(), login.getPhone(), mustChangePassword));
    }
}
