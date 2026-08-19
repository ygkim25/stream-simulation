package com.streaming.demo.service;

import com.streaming.demo.entity.Login;
import com.streaming.demo.repository.LoginRepository;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.util.List;

// 온도/전력 실시간 모니터링에서 "위험" 상태로 새로 진입할 때 admin 권한 계정들에게 메일 알림
@Service
public class CriticalAlertMailService {

    private static final Logger log = LoggerFactory.getLogger(CriticalAlertMailService.class);

    private final JavaMailSender mailSender;
    private final LoginRepository loginRepository;

    public CriticalAlertMailService(JavaMailSender mailSender, LoginRepository loginRepository) {
        this.mailSender = mailSender;
        this.loginRepository = loginRepository;
    }

    // tick() 스레드(equip-sim 풀)를 막지 않도록 별도 스레드(mailExecutor)에서 비동기 발송
    @Async("mailExecutor")
    public void sendCriticalAlert(String equipId, String equipName, String metricLabel,
                                   double value, double threshold) {
        List<Login> admins = loginRepository.findByRoleIgnoreCase("admin");
        if (admins.isEmpty()) {
            log.warn("위험 알림 메일 발송 스킵: role=ADMIN 계정이 없음. equipId={}", equipId);
            return;
        }

        String subject = "[WeCT] " + equipName + " " + metricLabel + " 위험 알림";
        String text = equipName + "(" + equipId + ")의 " + metricLabel + "이(가) 위험 상태입니다.\n" +
                "현재값: " + value + " / 임계값: " + threshold;

        // admin의 user_id를 메일 주소로 사용. 한 명 발송 실패해도 나머지 admin에게는 계속 보냄
        for (Login admin : admins) {
            String toAddress = admin.getUserId();
            try {
                SimpleMailMessage message = new SimpleMailMessage();
                message.setTo(toAddress);
                message.setSubject(subject);
                message.setText(text);
                mailSender.send(message);
            } catch (Exception e) {
                log.error("위험 알림 메일 발송 실패: equipId={}, to={}", equipId, toAddress, e);
            }
        }
    }
}
