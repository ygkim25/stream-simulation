package com.streaming.demo.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.streaming.demo.dto.ForgotPasswordReqDto;
import com.streaming.demo.dto.LoginReqDto;
import com.streaming.demo.dto.LoginResDto;
import com.streaming.demo.dto.UpdatePasswordDto;
import com.streaming.demo.entity.Login;
import com.streaming.demo.repository.LoginRepository;
import com.streaming.demo.security.JwtUtil;

import java.security.SecureRandom;
import java.time.LocalDateTime;

@RestController
@RequestMapping("/api/auth")
public class LoginController {

    // 임시 비밀번호 유효시간 및 재발송 쿨다운
    private static final long TEMP_PASSWORD_TTL_MINUTES = 15;
    private static final long TEMP_PASSWORD_COOLDOWN_SECONDS = 600;

    private final LoginRepository loginRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;
    private final JavaMailSender mailSender;
    private final SecureRandom secureRandom = new SecureRandom();

    public LoginController(LoginRepository loginRepository,
            PasswordEncoder passwordEncoder,
            JwtUtil jwtUtil,
            JavaMailSender mailSender) {
        this.loginRepository = loginRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtUtil = jwtUtil;
        this.mailSender = mailSender;
    }

    /*
     * 로그인 : 초기 비밀번호 12345
     */
    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody LoginReqDto request) {

        System.out.println("========== LoginController ---- login() ==========   로그인 계정 ::: " + request.getUserId());

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

            // 비밀번호 찾기로 발급된 임시 비밀번호는 유효시간이 지나면 로그인 자체를 거부
            if (login.isMustChangePassword() && login.getTempPasswordIssuedAt() != null
                    && LocalDateTime.now().isAfter(login.getTempPasswordIssuedAt().plusMinutes(TEMP_PASSWORD_TTL_MINUTES))) {
                return ResponseEntity.status(401).body("임시 비밀번호가 만료되었습니다. 비밀번호 찾기를 다시 시도해주세요.");
            }

            mustChangePassword = login.isMustChangePassword();
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
        login.setMustChangePassword(false);
        login.setTempPasswordIssuedAt(null);
        loginRepository.save(login);

        return ResponseEntity.ok().build();
    }

    /*
     * 비밀번호 찾기 : 등록된 이메일(user_id)로 임시 비밀번호 발송 후 즉시 로그인 비밀번호로 교체
     */
    @PostMapping("/reset-password")
    public ResponseEntity<?> forgotPassword(@RequestBody ForgotPasswordReqDto request) {

        var loginOpt = loginRepository.findByUserId(request.getUserId());

        if (loginOpt.isEmpty()) {
            return ResponseEntity.status(404).body("등록되지 않은 계정입니다.");
        }

        Login login = loginOpt.get();
        LocalDateTime now = LocalDateTime.now();

        // 재발송 쿨다운 체크 (연속 발송으로 인한 스팸/의도치 않은 비밀번호 교체 방지)
        if (login.getTempPasswordIssuedAt() != null
                && login.getTempPasswordIssuedAt().plusSeconds(TEMP_PASSWORD_COOLDOWN_SECONDS).isAfter(now)) {
            return ResponseEntity.status(429).body("잠시 후 다시 시도해주세요.");
        }

        String tempPassword = String.format("%08d", secureRandom.nextInt(100_000_000));

        // 메일 발송 성공을 먼저 확인한 뒤에만 실제 비밀번호를 교체 (발송 실패 시 계정 잠금 방지)
        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setTo(login.getUserId());
            message.setSubject("[WeCT] 임시 비밀번호 안내");
            message.setText(
                    "임시 비밀번호: " + tempPassword + "\n" +
                    "유효시간: 발급 후 " + TEMP_PASSWORD_TTL_MINUTES + "분\n" +
                    "본인이 요청하지 않았다면 즉시 관리자에게 문의해주세요.\n" +
                    "로그인 후에는 반드시 비밀번호를 변경해주세요.");
            mailSender.send(message);
        } catch (MailException e) {
            return ResponseEntity.status(500).body("메일 발송에 실패했습니다. 잠시 후 다시 시도해주세요.");
        }

        login.setPassword(passwordEncoder.encode(tempPassword));
        login.setMustChangePassword(true);
        login.setTempPasswordIssuedAt(now);
        loginRepository.save(login);

        return ResponseEntity.ok().build();
    }
}
