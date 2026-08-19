package com.streaming.demo.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

@Configuration
@EnableAsync
public class AsyncConfig {

    // 메일 발송용 전용 스레드풀. tick()이 쓰는 equip-sim 스케줄러(SchedulingConfig)와 분리해서
    // SMTP 전송 지연이 설비 tick 스케줄링을 막지 않게 함
    @Bean("mailExecutor")
    public ThreadPoolTaskExecutor mailExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(2);
        executor.setMaxPoolSize(4);
        executor.setQueueCapacity(50);
        executor.setThreadNamePrefix("mail-alert-");
        executor.initialize();
        return executor;
    }
}
