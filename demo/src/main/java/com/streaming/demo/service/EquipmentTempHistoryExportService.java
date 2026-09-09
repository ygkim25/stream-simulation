package com.streaming.demo.service;

import com.streaming.demo.entity.EquipmentTempHistory;
import com.streaming.demo.repository.EquipmentTempHistoryRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.io.Writer;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.stream.Stream;

@Service
public class EquipmentTempHistoryExportService {

    private static final DateTimeFormatter TIME_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final EquipmentTempHistoryRepository historyRepository;
    private final long maxRangeDays;

    public EquipmentTempHistoryExportService(
            EquipmentTempHistoryRepository historyRepository,
            @Value("${export.max-range-days:90}") long maxRangeDays) {
        this.historyRepository = historyRepository;
        this.maxRangeDays = maxRangeDays;
    }

    // 커서 기반 스트리밍으로 조회하면서 그대로 CSV로 흘려보냄 (전체를 메모리에 올리지 않음)
    @Transactional(readOnly = true)
    public void exportCsv(LocalDateTime from, LocalDateTime to, Writer writer) throws IOException {
        validateRange(from, to);

        writer.write(0xFEFF); // Excel이 UTF-8로 올바르게 인식하도록 BOM 기록
        writer.write("equipId,temperature,status,recordedAt\n");

        try (Stream<EquipmentTempHistory> stream =
                     historyRepository.streamByRecordedAtBetweenOrderByRecordedAtAsc(from, to)) {
            stream.forEach(h -> writeRow(writer, h));
        }
        writer.flush();
    }

    // 응답 스트림을 열기 전에 컨트롤러에서 먼저 호출해야 함
    // (스트림을 연 뒤 예외가 나면 응답이 이미 커밋되어 GlobalExceptionHandler가 상태코드를 바꿀 수 없음)
    public void validateRange(LocalDateTime from, LocalDateTime to) {
        if (from == null || to == null) {
            throw new IllegalArgumentException("시작/종료 시간은 필수입니다.");
        }
        if (!to.isAfter(from)) {
            throw new IllegalArgumentException("종료 시간은 시작 시간보다 이후여야 합니다.");
        }
        if (Duration.between(from, to).toDays() > maxRangeDays) {
            throw new IllegalArgumentException("조회 기간은 최대 " + maxRangeDays + "일까지 가능합니다.");
        }
    }

    private void writeRow(Writer writer, EquipmentTempHistory h) {
        try {
            writer.write(escape(h.getEquipId()));
            writer.write(',');
            writer.write(h.getTemperature() == null ? "" : String.valueOf(h.getTemperature()));
            writer.write(',');
            writer.write(escape(h.getStatus()));
            writer.write(',');
            writer.write(h.getRecordedAt() == null ? "" : h.getRecordedAt().format(TIME_FORMAT));
            writer.write('\n');
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private String escape(String value) {
        if (value == null) return "";
        if (value.contains(",") || value.contains("\"") || value.contains("\n")) {
            return "\"" + value.replace("\"", "\"\"") + "\"";
        }
        return value;
    }
}
