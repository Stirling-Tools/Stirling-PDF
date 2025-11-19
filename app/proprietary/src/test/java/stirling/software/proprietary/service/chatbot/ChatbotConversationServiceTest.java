package stirling.software.proprietary.service.chatbot;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static stirling.software.proprietary.service.chatbot.ChatbotFeatureProperties.*;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.test.util.ReflectionTestUtils;

import com.fasterxml.jackson.databind.ObjectMapper;

import stirling.software.proprietary.model.chatbot.ChatbotHistoryEntry;
import stirling.software.proprietary.model.chatbot.ChatbotSession;

@ExtendWith(MockitoExtension.class)
class ChatbotConversationServiceTest {

    @Mock private ChatModel chatModel;
    @Mock private ChatbotSessionRegistry sessionRegistry;
    @Mock private ChatbotCacheService cacheService;
    @Mock private ChatbotFeatureProperties featureProperties;
    @Mock private ChatbotRetrievalService retrievalService;
    @Mock private ChatbotContextCompressor contextCompressor;
    @Mock private ChatbotMemoryService memoryService;
    @Mock private ChatbotUsageService usageService;
    @Mock private ChatbotConversationStore conversationStore;

    private ChatbotConversationService conversationService;
    private ChatbotSettings defaultSettings;

    @BeforeEach
    void setUp() {
        conversationService =
                new ChatbotConversationService(
                        chatModel,
                        sessionRegistry,
                        cacheService,
                        featureProperties,
                        retrievalService,
                        contextCompressor,
                        memoryService,
                        usageService,
                        conversationStore,
                        new ObjectMapper());

        defaultSettings =
                new ChatbotSettings(
                        true,
                        true,
                        4000,
                        0.65D,
                        new ChatbotSettings.ModelSettings(
                                ChatbotSettings.ModelProvider.OPENAI,
                                "gpt-5-nano",
                                "gpt-5-mini",
                                "embed",
                                0.95D),
                        new ChatbotSettings.RagSettings(512, 128, 4),
                        new ChatbotSettings.CacheSettings(60, 10, 1000),
                        new ChatbotSettings.OcrSettings(false),
                        new ChatbotSettings.AuditSettings(false),
                        new ChatbotSettings.UsageSettings(100_000L, 0.7D));
    }

    @Test
    void summarizesAndTrimsHistoryWhenThresholdReached() {
        ChatbotSession session =
                ChatbotSession.builder()
                        .sessionId("session-1")
                        .documentId("doc-123")
                        .metadata(Map.of("documentName", "Quarterly Report"))
                        .build();

        when(conversationStore.defaultWindow()).thenReturn(2);
        when(conversationStore.retentionWindow()).thenReturn(10);
        when(conversationStore.historyLength("session-1")).thenReturn(6L);
        when(conversationStore.getRecentTurns("session-1", 10))
                .thenReturn(historyEntries(6, "doc-123", "Quarterly Report"));
        when(conversationStore.loadSummary("session-1")).thenReturn("previous summary");
        when(chatModel.call(any(Prompt.class)))
                .thenReturn(
                        new ChatResponse(
                                List.of(new Generation(new AssistantMessage("updated summary")))));

        ReflectionTestUtils.invokeMethod(
                conversationService, "summarizeConversation", defaultSettings, session);

        verify(chatModel, times(1)).call(any(Prompt.class));
        verify(conversationStore).storeSummary("session-1", "updated summary");
        verify(conversationStore).trimHistory("session-1", 2);
    }

    @Test
    void skipsSummarizationWhenHistoryBelowThreshold() {
        ChatbotSession session =
                ChatbotSession.builder().sessionId("session-2").documentId("doc").build();

        when(conversationStore.defaultWindow()).thenReturn(4);
        when(conversationStore.historyLength("session-2")).thenReturn(5L);

        ReflectionTestUtils.invokeMethod(
                conversationService, "summarizeConversation", defaultSettings, session);

        verify(chatModel, never()).call(any(org.springframework.ai.chat.prompt.Prompt.class));
        verify(conversationStore, never()).storeSummary(anyString(), anyString());
        verify(conversationStore, never()).trimHistory(anyString(), anyInt());
    }

    private List<ChatbotHistoryEntry> historyEntries(
            int count, String documentId, String documentName) {
        List<ChatbotHistoryEntry> entries = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            entries.add(
                    new ChatbotHistoryEntry(
                            i % 2 == 0 ? "user" : "assistant",
                            "message-" + i,
                            documentId,
                            documentName,
                            Instant.now().minusSeconds(60L - i)));
        }
        return entries;
    }
}
