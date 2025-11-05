package stirling.software.proprietary.service.chatbot;

import java.io.IOException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicBoolean;

import org.springframework.ai.chat.messages.SystemMessage;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.openai.OpenAiChatModel;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.model.chatbot.ChatbotDocumentCacheEntry;
import stirling.software.proprietary.model.chatbot.ChatbotQueryRequest;
import stirling.software.proprietary.model.chatbot.ChatbotResponse;
import stirling.software.proprietary.model.chatbot.ChatbotSession;
import stirling.software.proprietary.model.chatbot.ChatbotTextChunk;
import stirling.software.proprietary.service.chatbot.ChatbotFeatureProperties.ChatbotSettings;
import stirling.software.proprietary.service.chatbot.exception.ChatbotException;

@Service
@Slf4j
@RequiredArgsConstructor
@ConditionalOnProperty(value = "premium.proFeatures.chatbot.enabled", havingValue = "true")
public class ChatbotConversationService {

    private final ChatModel chatModel;
    private final ChatbotSessionRegistry sessionRegistry;
    private final ChatbotCacheService cacheService;
    private final ChatbotFeatureProperties featureProperties;
    private final ChatbotRetrievalService retrievalService;
    private final ObjectMapper objectMapper;
    private final AtomicBoolean modelSwitchVerified = new AtomicBoolean(false);

    public ChatbotResponse handleQuery(ChatbotQueryRequest request) {
        ChatbotSettings settings = featureProperties.current();
        if (!settings.enabled()) {
            throw new ChatbotException("Chatbot feature is disabled");
        }
        if (!StringUtils.hasText(request.getPrompt())) {
            throw new ChatbotException("Prompt cannot be empty");
        }
        if (request.getPrompt().length() > settings.maxPromptCharacters()) {
            throw new ChatbotException("Prompt exceeds maximum allowed characters");
        }
        ChatbotSession session =
                sessionRegistry
                        .findById(request.getSessionId())
                        .orElseThrow(() -> new ChatbotException("Unknown chatbot session"));

        ensureModelSwitchCapability();

        ChatbotDocumentCacheEntry cacheEntry =
                cacheService
                        .resolveBySessionId(request.getSessionId())
                        .orElseThrow(() -> new ChatbotException("Session cache not found"));

        List<String> warnings = buildWarnings(settings, session);

        List<ChatbotTextChunk> context =
                retrievalService.retrieveTopK(
                        request.getSessionId(), request.getPrompt(), settings);

        ModelReply nanoReply =
                invokeModel(
                        settings.models().primary(),
                        request.getPrompt(),
                        session,
                        context,
                        cacheEntry.getMetadata());

        boolean shouldEscalate =
                request.isAllowEscalation()
                        && (nanoReply.requiresEscalation()
                                || nanoReply.confidence() < settings.minConfidenceNano()
                                || request.getPrompt().length() > settings.maxPromptCharacters());

        ModelReply finalReply = nanoReply;
        boolean escalated = false;
        if (shouldEscalate) {
            escalated = true;
            List<ChatbotTextChunk> expandedContext = ensureMinimumContext(context, cacheEntry);
            finalReply =
                    invokeModel(
                            settings.models().fallback(),
                            request.getPrompt(),
                            session,
                            expandedContext,
                            cacheEntry.getMetadata());
        }

        return ChatbotResponse.builder()
                .sessionId(request.getSessionId())
                .modelUsed(
                        shouldEscalate ? settings.models().fallback() : settings.models().primary())
                .confidence(finalReply.confidence())
                .answer(finalReply.answer())
                .escalated(escalated)
                .servedFromNanoOnly(!escalated)
                .cacheHit(true)
                .respondedAt(Instant.now())
                .warnings(warnings)
                .metadata(buildMetadata(finalReply, context.size(), escalated))
                .build();
    }

    private List<String> buildWarnings(ChatbotSettings settings, ChatbotSession session) {
        List<String> warnings = new ArrayList<>();
        warnings.add("Chatbot is in alpha – behaviour may change.");
        warnings.add("Image content is not yet supported in answers.");
        if (session.isOcrRequested()) {
            warnings.add("OCR costs may apply for this session.");
        }
        return warnings;
    }

    private Map<String, Object> buildMetadata(
            ModelReply reply, int contextSize, boolean escalated) {
        Map<String, Object> metadata = new HashMap<>();
        metadata.put("contextSize", contextSize);
        metadata.put("requiresEscalation", reply.requiresEscalation());
        metadata.put("escalated", escalated);
        metadata.put("rationale", reply.rationale());
        return metadata;
    }

    private void ensureModelSwitchCapability() {
        if (!(chatModel instanceof OpenAiChatModel)) {
            throw new ChatbotException(
                    "Chatbot requires OpenAI chat model to support runtime model switching");
        }
        if (modelSwitchVerified.compareAndSet(false, true)) {
            ChatbotSettings settings = featureProperties.current();
            OpenAiChatOptions primary =
                    OpenAiChatOptions.builder().model(settings.models().primary()).build();
            OpenAiChatOptions fallback =
                    OpenAiChatOptions.builder().model(settings.models().fallback()).build();
            log.info(
                    "Verified runtime model override support ({} -> {})",
                    primary.getModel(),
                    fallback.getModel());
        }
    }

    private List<ChatbotTextChunk> ensureMinimumContext(
            List<ChatbotTextChunk> context, ChatbotDocumentCacheEntry entry) {
        if (context.size() >= 3 || entry.getChunks().size() <= context.size()) {
            return context;
        }
        List<ChatbotTextChunk> augmented = new ArrayList<>(context);
        for (ChatbotTextChunk chunk : entry.getChunks()) {
            if (augmented.size() >= 3) {
                break;
            }
            if (!augmented.contains(chunk)) {
                augmented.add(chunk);
            }
        }
        return augmented;
    }

    private ModelReply invokeModel(
            String model,
            String prompt,
            ChatbotSession session,
            List<ChatbotTextChunk> context,
            Map<String, String> metadata) {
        Prompt requestPrompt = buildPrompt(model, prompt, session, context, metadata);
        ChatResponse response = chatModel.call(requestPrompt);
        String content =
                Optional.ofNullable(response)
                        .map(ChatResponse::getResults)
                        .filter(results -> !results.isEmpty())
                        .map(results -> results.get(0).getOutput().getText())
                        .orElse("");
        return parseModelResponse(content);
    }

    private Prompt buildPrompt(
            String model,
            String question,
            ChatbotSession session,
            List<ChatbotTextChunk> context,
            Map<String, String> metadata) {
        StringBuilder contextBuilder = new StringBuilder();
        for (ChatbotTextChunk chunk : context) {
            contextBuilder
                    .append("[Chunk ")
                    .append(chunk.getOrder())
                    .append("]\n")
                    .append(chunk.getText())
                    .append("\n\n");
        }
        String metadataSummary =
                metadata.entrySet().stream()
                        .map(entry -> entry.getKey() + ": " + entry.getValue())
                        .reduce((left, right) -> left + ", " + right)
                        .orElse("none");

        String systemPrompt =
                "You are Stirling PDF Bot. Use provided context strictly. "
                        + "Respond in compact JSON with fields answer (string), confidence (0..1), requiresEscalation (boolean), rationale (string). "
                        + "Explain limitations when context insufficient.";

        String userPrompt =
                "Document metadata: "
                        + metadataSummary
                        + "\nOCR applied: "
                        + session.isOcrRequested()
                        + "\nContext:\n"
                        + contextBuilder
                        + "Question: "
                        + question;

        OpenAiChatOptions options =
                OpenAiChatOptions.builder().model(model).temperature(0.2).build();

        return new Prompt(
                List.of(new SystemMessage(systemPrompt), new UserMessage(userPrompt)), options);
    }

    private ModelReply parseModelResponse(String raw) {
        if (!StringUtils.hasText(raw)) {
            throw new ChatbotException("Model returned empty response");
        }
        try {
            JsonNode node = objectMapper.readTree(raw);
            String answer =
                    Optional.ofNullable(node.get("answer")).map(JsonNode::asText).orElse(raw);
            double confidence =
                    Optional.ofNullable(node.get("confidence"))
                            .map(JsonNode::asDouble)
                            .orElse(0.0D);
            boolean requiresEscalation =
                    Optional.ofNullable(node.get("requiresEscalation"))
                            .map(JsonNode::asBoolean)
                            .orElse(false);
            String rationale =
                    Optional.ofNullable(node.get("rationale"))
                            .map(JsonNode::asText)
                            .orElse("Model did not provide rationale");
            return new ModelReply(answer, confidence, requiresEscalation, rationale);
        } catch (IOException ex) {
            log.warn("Failed to parse model JSON response, returning raw text", ex);
            return new ModelReply(raw, 0.0D, true, "Unable to parse JSON response");
        }
    }

    private record ModelReply(
            String answer, double confidence, boolean requiresEscalation, String rationale) {}
}
