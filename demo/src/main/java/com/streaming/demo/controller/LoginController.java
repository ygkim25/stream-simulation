package com.streaming.demo.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.streaming.demo.dto.LoginReqDto;
import com.streaming.demo.dto.LoginResDto;
import com.streaming.demo.dto.UpdatePasswordDto;
import com.streaming.demo.entity.Login;
import com.streaming.demo.repository.LoginRepository;
import com.streaming.demo.security.JwtUtil;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

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

    /*
     * 로그인 : 초기 비밀번호 12345
     */
    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody LoginReqDto request) {

        System.out.println("========== LoginController ---- login() ==========" + request.getUserId());

        var loginOpt = loginRepository.findByUserId(request.getUserId());

        if (loginOpt.isEmpty()) {
            return ResponseEntity.status(401).body("등록되지 않은 계정입니다.");
        }

        Login login = loginOpt.get();
        boolean mustChangePassword;

        if (login.getPassword() == null || login.getPassword().isBlank()) {
            if (!"12345".equals(request.getPassword())) {
                return ResponseEntity.status(401).body("비밀번호가 일치하지 않습니다.");
            }
            mustChangePassword = true;
        } else {
            if (!passwordEncoder.matches(request.getPassword(), login.getPassword())) {
                return ResponseEntity.status(401).body("비밀번호가 일치하지 않습니다.");
            }
            mustChangePassword = false;
        }

        String token = jwtUtil.generateToken(login.getUserId());

        return ResponseEntity.ok(new LoginResDto(
                token, login.getUserId(), login.getUserName(), login.getDivisionCode(), login.getPhone(), login.getDivisionName(), login.getResponsibility(), login.getRole(),
                mustChangePassword));
    }

    /*
     * 비밀번호 변경
     */
    @PostMapping("/change-password")
    public ResponseEntity<?> changePassword(@RequestBody UpdatePasswordDto request,
            @RequestHeader("Authorization") String authHeader) {

        System.out.println("========== LoginController ---- changePassword() ==========");
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

        // 1) 현재 비밀번호 검증
        boolean currentPasswordValid;
        if (login.getPassword() == null || login.getPassword().isBlank()) {
            // 아직 비밀번호를 설정한 적 없는 계정 -> 초기값 "12345"만 허용
            currentPasswordValid = "12345".equals(request.getCurrentPassword());
        } else {
            currentPasswordValid = passwordEncoder.matches(
                    request.getCurrentPassword(), login.getPassword());
        }

        if (!currentPasswordValid) {
            return ResponseEntity.status(400).body("현재 비밀번호가 일치하지 않습니다.");
        }

        // 2) 새 비밀번호로 변경
        String newPassword = request.getNewPassword();
        if (newPassword == null || newPassword.length() < 6) {
            return ResponseEntity.status(400).body("새 비밀번호는 최소 6자 이상이어야 합니다.");
        }
        if ("12345".equals(newPassword)) {
            return ResponseEntity.status(400).body("초기 비밀번호와 다른 비밀번호를 설정해주세요.");
        }
        if (newPassword.equals(request.getCurrentPassword())) {
            return ResponseEntity.status(400).body("현재 사용중인 비밀번호 입니다. 다른 비밀번호를 설정해주세요.");
        }

        // 3) 암호화해서 저장
        login.setPassword(passwordEncoder.encode(newPassword));
        loginRepository.save(login);

        return ResponseEntity.ok().build();
    }
}
