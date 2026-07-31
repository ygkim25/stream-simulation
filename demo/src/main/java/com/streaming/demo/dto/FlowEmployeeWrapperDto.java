package com.streaming.demo.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.List;

@JsonIgnoreProperties(ignoreUnknown = true)
public class FlowEmployeeWrapperDto {

    private ResponseBody response;

    public ResponseBody getResponse() { return response; }
    public void setResponse(ResponseBody response) { this.response = response; }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class ResponseBody {
        private boolean success;
        private int code;
        private String message;
        private DataBody data;

        public boolean isSuccess() { return success; }
        public void setSuccess(boolean success) { this.success = success; }

        public int getCode() { return code; }
        public void setCode(int code) { this.code = code; }

        public String getMessage() { return message; }
        public void setMessage(String message) { this.message = message; }

        public DataBody getData() { return data; }
        public void setData(DataBody data) { this.data = data; }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class DataBody {
        private boolean hasNext;
        private int lastCursor;
        private List<FlowEmployeeApiDto> employees;

        public boolean isHasNext() { return hasNext; }
        public void setHasNext(boolean hasNext) { this.hasNext = hasNext; }

        public int getLastCursor() { return lastCursor; }
        public void setLastCursor(int lastCursor) { this.lastCursor = lastCursor; }

        public List<FlowEmployeeApiDto> getEmployees() { return employees; }
        public void setEmployees(List<FlowEmployeeApiDto> employees) { this.employees = employees; }
    }
}