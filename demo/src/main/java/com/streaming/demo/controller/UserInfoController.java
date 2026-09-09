package com.streaming.demo.controller;

import com.streaming.demo.dto.UserInfoDto;
import com.streaming.demo.entity.Login;
import com.streaming.demo.repository.LoginRepository;
import com.streaming.demo.security.JwtUtil;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

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
        System.out.println("========== UserInfoController ---- getMyInfo() ==========");

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
                login.getDivisionCode(),
                login.getRole(),
                login.getDivisionName(),
                login.getResponsibility(),
                login.getAlarmEnable()
            );

        return ResponseEntity.ok(response);
    }

    // 마이페이지 - 사용자 조회
    @GetMapping("/users")
    public ResponseEntity<?> getAllUsers(@RequestHeader("Authorization") String authHeader) {
        System.out.println("========== UserInfoController ---- getAllUsers() ==========");

        String token = authHeader.replace("Bearer ", "");

        if (!jwtUtil.isTokenValid(token)) {
            return ResponseEntity.status(401).body("인증이 만료되었습니다.");
        }

        List<UserInfoDto> users = loginRepository.findAll().stream()
                .map(login -> new UserInfoDto(
                        login.getUserId(),
                        login.getUserName(),
                        login.getPhone(),
                        login.getDivisionCode(),
                        login.getRole(),
                        login.getDivisionName(),
                        login.getResponsibility(),
                        login.getAlarmEnable()
                ))
                .collect(Collectors.toList());

        return ResponseEntity.ok(users);
    }

    private static final Set<String> VALID_ROLES = Set.of("ADMIN", "USER");
    private static final Set<String> VALID_ALARM_VALUES = Set.of("on", "off");

    // 마이페이지 - 본인 메일 알림 on/off 토글
    @PatchMapping("/employee/me/alarm")
    public ResponseEntity<?> updateMyAlarmEnable(
            @RequestBody Map<String, String> body,
            @RequestHeader("Authorization") String authHeader) {
        System.out.println("========== UserInfoController ---- updateMyAlarmEnable() ==========");

        String token = authHeader.replace("Bearer ", "");

        if (!jwtUtil.isTokenValid(token)) {
            return ResponseEntity.status(401).body("인증이 만료되었습니다.");
        }

        String newAlarmEnable = body.get("alarmEnable");
        if (!VALID_ALARM_VALUES.contains(newAlarmEnable)) {
            return ResponseEntity.badRequest().body("alarmEnable 값은 on 또는 off여야 합니다.");
        }

        String userId = jwtUtil.extractUserId(token);
        var loginOpt = loginRepository.findByUserId(userId);
        if (loginOpt.isEmpty()) {
            return ResponseEntity.status(404).body("사용자를 찾을 수 없습니다.");
        }

        Login login = loginOpt.get();
        login.setAlarmEnable(newAlarmEnable);
        loginRepository.save(login);

        return ResponseEntity.ok(Map.of("userId", userId, "alarmEnable", newAlarmEnable));
    }

    // 마이페이지 - 사용자 조회 탭에서 권한 변경 (관리자만 가능)
    @PatchMapping("/users/{userId}/role")
    public ResponseEntity<?> updateUserRole(
            @PathVariable("userId") String userId,
            @RequestBody Map<String, String> body,
            @RequestHeader("Authorization") String authHeader) {
        System.out.println("========== UserInfoController ---- updateUserRole() ==========");

        String token = authHeader.replace("Bearer ", "");

        if (!jwtUtil.isTokenValid(token)) {
            return ResponseEntity.status(401).body("인증이 만료되었습니다.");
        }

        String requesterId = jwtUtil.extractUserId(token);
        var requesterOpt = loginRepository.findByUserId(requesterId);
        if (requesterOpt.isEmpty() || !"ADMIN".equals(requesterOpt.get().getRole())) {
            return ResponseEntity.status(403).body("관리자만 권한을 변경할 수 있습니다.");
        }

        String newRole = body.get("role");
        if (!VALID_ROLES.contains(newRole)) {
            return ResponseEntity.badRequest().body("role 값은 ADMIN 또는 USER여야 합니다.");
        }

        var targetOpt = loginRepository.findByUserId(userId);
        if (targetOpt.isEmpty()) {
            return ResponseEntity.status(404).body("사용자를 찾을 수 없습니다.");
        }
 
        Login target = targetOpt.get();
        target.setRole(newRole);
        loginRepository.save(target);

        return ResponseEntity.ok(Map.of("userId", userId, "role", newRole));
    }
}
