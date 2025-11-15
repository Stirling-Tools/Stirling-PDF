package stirling.software.proprietary.controller;

import java.util.ArrayList;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.model.chatbot.ChatbotQueryRequest;
import stirling.software.proprietary.model.chatbot.ChatbotResponse;
import stirling.software.proprietary.model.chatbot.ChatbotSession;
import stirling.software.proprietary.model.chatbot.ChatbotSessionCreateRequest;
import stirling.software.proprietary.model.chatbot.ChatbotSessionResponse;
import stirling.software.proprietary.model.chatbot.ChatbotUsageSummary;
import stirling.software.proprietary.service.chatbot.ChatbotCacheService;
import stirling.software.proprietary.service.chatbot.ChatbotFeatureProperties;
import stirling.software.proprietary.service.chatbot.ChatbotFeatureProperties.ChatbotSettings;
import stirling.software.proprietary.service.chatbot.ChatbotService;
import stirling.software.proprietary.service.chatbot.ChatbotSessionRegistry;
import stirling.software.proprietary.service.chatbot.exception.ChatbotException;

@Slf4j
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/internal/chatbot")
public class ChatbotController {

    private final ChatbotService chatbotService;
    private final ChatbotSessionRegistry sessionRegistry;
    private final ChatbotCacheService cacheService;
    private final ChatbotFeatureProperties featureProperties;

    @PostMapping("/session")
    public ResponseEntity<ChatbotSessionResponse> createSession(
            @RequestBody ChatbotSessionCreateRequest request) {
        ChatbotSession session = chatbotService.createSession(request);
        ChatbotSettings settings = featureProperties.current();
        ChatbotSessionResponse response = toResponse(session, settings);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PostMapping("/query")
    public ResponseEntity<ChatbotResponse> query(@RequestBody ChatbotQueryRequest request) {
        ChatbotResponse response = chatbotService.ask(request);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/session/{sessionId}")
    public ResponseEntity<ChatbotSessionResponse> getSession(@PathVariable String sessionId) {
        ChatbotSettings settings = featureProperties.current();
        ChatbotSession session =
                sessionRegistry
                        .findById(sessionId)
                        .orElseThrow(() -> new ChatbotException("Session not found"));
        ChatbotSessionResponse response = toResponse(session, settings);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/document/{documentId}")
    public ResponseEntity<ChatbotSessionResponse> getSessionByDocument(
            @PathVariable String documentId) {
        ChatbotSettings settings = featureProperties.current();
        ChatbotSession session =
                sessionRegistry
                        .findByDocumentId(documentId)
                        .orElseThrow(() -> new ChatbotException("Session not found"));
        return ResponseEntity.ok(toResponse(session, settings));
    }

    @DeleteMapping("/session/{sessionId}")
    public ResponseEntity<Void> closeSession(@PathVariable String sessionId) {
        chatbotService.close(sessionId);
        return ResponseEntity.noContent().build();
    }

    private List<String> sessionWarnings(ChatbotSettings settings, ChatbotSession session) {
        List<String> warnings = new ArrayList<>();

        if (session != null && session.isImageContentDetected()) {
            warnings.add("Images detected - Images are not currently supported.");
        }

        warnings.add("Images are not yet supported. Only extracted text is sent for analysis.");
        if (session != null && session.isOcrRequested()) {
            warnings.add("OCR requested – uses credits .");
        }

        if (session != null && session.getUsageSummary() != null) {
            ChatbotUsageSummary usage = session.getUsageSummary();
            if (usage.isLimitExceeded()) {
                warnings.add("Monthly chatbot allocation exceeded – requests may be throttled.");
            } else if (usage.isNearingLimit()) {
                warnings.add("You are approaching the monthly chatbot allocation.");
            }
        }

        return warnings;
    }

    private ChatbotSessionResponse toResponse(ChatbotSession session, ChatbotSettings settings) {
        return ChatbotSessionResponse.builder()
                .sessionId(session.getSessionId())
                .documentId(session.getDocumentId())
                .alphaWarning(settings.alphaWarning())
                .ocrRequested(session.isOcrRequested())
                .imageContentDetected(session.isImageContentDetected())
                .textCharacters(session.getTextCharacters())
                .estimatedTokens(session.getEstimatedTokens())
                .maxCachedCharacters(cacheService.getMaxDocumentCharacters())
                .createdAt(session.getCreatedAt())
                .warnings(sessionWarnings(settings, session))
                .metadata(session.getMetadata())
                .usageSummary(session.getUsageSummary())
                .build();
    }
}
