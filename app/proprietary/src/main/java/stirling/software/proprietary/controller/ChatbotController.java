package stirling.software.proprietary.controller;

import java.util.ArrayList;
import java.util.List;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
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
import stirling.software.proprietary.service.chatbot.ChatbotCacheService;
import stirling.software.proprietary.service.chatbot.ChatbotFeatureProperties;
import stirling.software.proprietary.service.chatbot.ChatbotFeatureProperties.ChatbotSettings;
import stirling.software.proprietary.service.chatbot.ChatbotService;
import stirling.software.proprietary.service.chatbot.ChatbotSessionRegistry;
import stirling.software.proprietary.service.chatbot.exception.ChatbotException;

@RestController
@RequestMapping("/api/internal/chatbot")
@RequiredArgsConstructor
@Slf4j
@ConditionalOnProperty(value = "premium.proFeatures.chatbot.enabled", havingValue = "true")
@ConditionalOnBean(ChatbotService.class)
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
        ChatbotSessionResponse response =
                ChatbotSessionResponse.builder()
                        .sessionId(session.getSessionId())
                        .documentId(session.getDocumentId())
                        .alphaWarning(settings.alphaWarning())
                        .ocrRequested(session.isOcrRequested())
                        .imageContentDetected(session.isImageContentDetected())
                        .textCharacters(session.getTextCharacters())
                        .maxCachedCharacters(cacheService.getMaxDocumentCharacters())
                        .createdAt(session.getCreatedAt())
                        .warnings(sessionWarnings(settings, session))
                        .metadata(session.getMetadata())
                        .build();
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
        ChatbotSessionResponse response =
                ChatbotSessionResponse.builder()
                        .sessionId(session.getSessionId())
                        .documentId(session.getDocumentId())
                        .alphaWarning(settings.alphaWarning())
                        .ocrRequested(session.isOcrRequested())
                        .imageContentDetected(session.isImageContentDetected())
                        .textCharacters(session.getTextCharacters())
                        .maxCachedCharacters(cacheService.getMaxDocumentCharacters())
                        .createdAt(session.getCreatedAt())
                        .warnings(sessionWarnings(settings, session))
                        .metadata(session.getMetadata())
                        .build();
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/session/{sessionId}")
    public ResponseEntity<Void> closeSession(@PathVariable String sessionId) {
        chatbotService.close(sessionId);
        return ResponseEntity.noContent().build();
    }

    private List<String> sessionWarnings(ChatbotSettings settings, ChatbotSession session) {
        List<String> warnings = new ArrayList<>();
        if (settings.alphaWarning()) {
            warnings.add("Chatbot feature is in alpha and may change.");
        }
        warnings.add("Image-based content is not supported yet.");
        if (session != null && session.isImageContentDetected()) {
            warnings.add("Detected images will be ignored until image support ships.");
        }
        warnings.add("Only extracted text is sent for analysis.");
        if (session != null && session.isOcrRequested()) {
            warnings.add("OCR was requested – extra processing charges may apply.");
        }
        return warnings;
    }
}
