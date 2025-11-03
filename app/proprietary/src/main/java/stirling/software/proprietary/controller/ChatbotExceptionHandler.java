package stirling.software.proprietary.controller;

import java.time.Instant;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.service.chatbot.exception.ChatbotException;
import stirling.software.proprietary.service.chatbot.exception.NoTextDetectedException;

@RestControllerAdvice(assignableTypes = ChatbotController.class)
@Slf4j
public class ChatbotExceptionHandler {

    @ExceptionHandler(NoTextDetectedException.class)
    public ResponseEntity<Map<String, Object>> handleNoText(NoTextDetectedException ex) {
        return buildResponse(HttpStatus.UNPROCESSABLE_ENTITY, ex.getMessage());
    }

    @ExceptionHandler(ChatbotException.class)
    public ResponseEntity<Map<String, Object>> handleChatbot(ChatbotException ex) {
        log.debug("Chatbot exception: {}", ex.getMessage());
        return buildResponse(HttpStatus.BAD_REQUEST, ex.getMessage());
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> handleIllegalArgument(IllegalArgumentException ex) {
        return buildResponse(HttpStatus.BAD_REQUEST, ex.getMessage());
    }

    private ResponseEntity<Map<String, Object>> buildResponse(HttpStatus status, String message) {
        Map<String, Object> payload =
                Map.of(
                        "timestamp", Instant.now().toString(),
                        "status", status.value(),
                        "error", message);
        return ResponseEntity.status(status).body(payload);
    }
}
