package stirling.software.proprietary.service.chatbot;

import static org.mockito.Mockito.any;
import static org.mockito.Mockito.eq;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.proprietary.model.chatbot.ChatbotQueryRequest;
import stirling.software.proprietary.model.chatbot.ChatbotResponse;
import stirling.software.proprietary.model.chatbot.ChatbotSession;
import stirling.software.proprietary.model.chatbot.ChatbotSessionCreateRequest;
import stirling.software.proprietary.service.AuditService;
import stirling.software.proprietary.service.chatbot.ChatbotFeatureProperties.ChatbotSettings;

@ExtendWith(MockitoExtension.class)
class ChatbotServiceTest {

    @Mock private ChatbotIngestionService ingestionService;
    @Mock private ChatbotConversationService conversationService;
    @Mock private ChatbotSessionRegistry sessionRegistry;
    @Mock private ChatbotCacheService cacheService;
    @Mock private ChatbotFeatureProperties featureProperties;
    @Mock private AuditService auditService;

    @InjectMocks private ChatbotService chatbotService;

    private ChatbotSettings auditEnabledSettings;
    private ChatbotSettings auditDisabledSettings;

    @BeforeEach
    void init() {
        auditEnabledSettings =
                new ChatbotSettings(
                        true,
                        true,
                        4000,
                        0.5D,
                        new ChatbotSettings.ModelSettings("gpt-5-nano", "gpt-5-mini", "embed"),
                        new ChatbotSettings.RagSettings(512, 128, 4),
                        new ChatbotSettings.CacheSettings(60, 10, 1000),
                        new ChatbotSettings.OcrSettings(false),
                        new ChatbotSettings.AuditSettings(true));

        auditDisabledSettings =
                new ChatbotSettings(
                        true,
                        true,
                        4000,
                        0.5D,
                        new ChatbotSettings.ModelSettings("gpt-5-nano", "gpt-5-mini", "embed"),
                        new ChatbotSettings.RagSettings(512, 128, 4),
                        new ChatbotSettings.CacheSettings(60, 10, 1000),
                        new ChatbotSettings.OcrSettings(false),
                        new ChatbotSettings.AuditSettings(false));
    }

    @Test
    void createSessionEmitsAuditWhenEnabled() {
        ChatbotSession session =
                ChatbotSession.builder()
                        .sessionId("session-1")
                        .documentId("doc-1")
                        .ocrRequested(true)
                        .createdAt(Instant.now())
                        .build();
        when(ingestionService.ingest(any())).thenReturn(session);
        when(featureProperties.current()).thenReturn(auditEnabledSettings);

        chatbotService.createSession(
                ChatbotSessionCreateRequest.builder().text("abc").warningsAccepted(true).build());

        ArgumentCaptor<Map<String, Object>> payloadCaptor = ArgumentCaptor.forClass(Map.class);
        verify(auditService)
                .audit(
                        eq(stirling.software.proprietary.audit.AuditEventType.PDF_PROCESS),
                        payloadCaptor.capture());
        Map<String, Object> payload = payloadCaptor.getValue();
        verify(cacheService, times(0)).invalidateSession(any());
        org.junit.jupiter.api.Assertions.assertEquals("session-1", payload.get("sessionId"));
    }

    @Test
    void querySkipsAuditWhenDisabled() {
        ChatbotQueryRequest request =
                ChatbotQueryRequest.builder()
                        .sessionId("session-2")
                        .prompt("Hello?")
                        .allowEscalation(true)
                        .build();
        ChatbotResponse response =
                ChatbotResponse.builder()
                        .sessionId("session-2")
                        .modelUsed("gpt-5-nano")
                        .confidence(0.8D)
                        .build();
        when(conversationService.handleQuery(request)).thenReturn(response);
        when(featureProperties.current()).thenReturn(auditDisabledSettings);

        chatbotService.ask(request);

        verify(auditService, times(0))
                .audit(eq(stirling.software.proprietary.audit.AuditEventType.PDF_PROCESS), any());
    }

    @Test
    void closeSessionInvalidatesCache() {
        ChatbotSession session =
                ChatbotSession.builder().sessionId("session-3").documentId("doc").build();
        when(sessionRegistry.findById("session-3")).thenReturn(Optional.of(session));
        when(featureProperties.current()).thenReturn(auditEnabledSettings);

        chatbotService.close("session-3");

        verify(sessionRegistry).remove("session-3");
        verify(cacheService).invalidateSession("session-3");
    }
}
