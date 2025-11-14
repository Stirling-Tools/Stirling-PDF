package stirling.software.proprietary.service.chatbot;

import static stirling.software.proprietary.service.chatbot.ChatbotFeatureProperties.ChatbotSettings.ModelProvider.OLLAMA;

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
import org.springframework.ai.document.Document;
import org.springframework.ai.ollama.OllamaChatModel;
import org.springframework.ai.openai.OpenAiChatModel;
import org.springframework.ai.openai.OpenAiChatOptions;
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
import stirling.software.proprietary.model.chatbot.ChatbotUsageSummary;
import stirling.software.proprietary.service.chatbot.ChatbotFeatureProperties.ChatbotSettings;
import stirling.software.proprietary.service.chatbot.exception.ChatbotException;

@Slf4j
@Service
@RequiredArgsConstructor
public class ChatbotConversationService {

    private final ChatModel chatModel;
    private final ChatbotSessionRegistry sessionRegistry;
    private final ChatbotCacheService cacheService;
    private final ChatbotFeatureProperties featureProperties;
    private final ChatbotRetrievalService retrievalService;
    private final ChatbotContextCompressor contextCompressor;
    private final ChatbotMemoryService memoryService;
    private final ChatbotUsageService usageService;
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

        ensureModelSwitchCapability(settings);

        ChatbotDocumentCacheEntry cacheEntry =
                cacheService
                        .resolveBySessionId(request.getSessionId())
                        .orElseThrow(() -> new ChatbotException("Session cache not found"));

        List<String> warnings = buildWarnings(settings, session);

        List<Document> context =
                retrievalService.retrieveTopK(
                        request.getSessionId(), request.getPrompt(), settings);
        String contextSummary =
                contextCompressor.summarize(
                        context, (int) Math.max(settings.maxPromptCharacters() / 2, 1000));

        ModelReply nanoReply =
                invokeModel(
                        settings,
                        settings.models().primary(),
                        request.getPrompt(),
                        session,
                        context,
                        contextSummary,
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
            finalReply =
                    invokeModel(
                            settings,
                            settings.models().fallback(),
                            request.getPrompt(),
                            session,
                            context,
                            contextSummary,
                            cacheEntry.getMetadata());
        }

        ChatbotUsageSummary usageSummary =
                usageService.registerGeneration(
                        session.getUserId(),
                        finalReply.promptTokens(),
                        finalReply.completionTokens());
        session.setUsageSummary(usageSummary);

        memoryService.recordTurn(session, request.getPrompt(), finalReply.answer());

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
                .metadata(buildMetadata(settings, session, finalReply, context.size(), escalated))
                .promptTokens(finalReply.promptTokens())
                .completionTokens(finalReply.completionTokens())
                .totalTokens(finalReply.totalTokens())
                .usageSummary(usageSummary)
                .build();
    }

    private List<String> buildWarnings(ChatbotSettings settings, ChatbotSession session) {
        List<String> warnings = new ArrayList<>();
        warnings.add("Chatbot is in alpha – behaviour may change.");
        warnings.add("Image content is not yet supported in answers.");
        if (session.isImageContentDetected()) {
            warnings.add(
                    "Detected document images will be ignored until image support is available.");
        }
        if (session.isOcrRequested()) {
            warnings.add("OCR costs may apply for this session.");
        }
        return warnings;
    }

    private Map<String, Object> buildMetadata(
            ChatbotSettings settings,
            ChatbotSession session,
            ModelReply reply,
            int contextSize,
            boolean escalated) {
        Map<String, Object> metadata = new HashMap<>();
        metadata.put("contextSize", contextSize);
        metadata.put("requiresEscalation", reply.requiresEscalation());
        metadata.put("escalated", escalated);
        metadata.put("rationale", reply.rationale());
        metadata.put("modelProvider", settings.models().provider().name());
        metadata.put("imageContentDetected", session.isImageContentDetected());
        metadata.put("charactersCached", session.getTextCharacters());
        metadata.put("promptTokens", reply.promptTokens());
        metadata.put("completionTokens", reply.completionTokens());
        metadata.put("totalTokens", reply.totalTokens());
        return metadata;
    }

    private void ensureModelSwitchCapability(ChatbotSettings settings) {
        ChatbotSettings.ModelProvider provider = settings.models().provider();
        switch (provider) {
            case OPENAI -> {
                if (!(chatModel instanceof OpenAiChatModel)) {
                    throw new ChatbotException(
                            "Chatbot requires an OpenAI chat model to support runtime model switching.");
                }
            }
            case OLLAMA -> {
                if (!(chatModel instanceof OllamaChatModel)) {
                    throw new ChatbotException(
                            "Chatbot is configured for Ollama but no Ollama chat model bean is available.");
                }
            }
        }
        if (modelSwitchVerified.compareAndSet(false, true)) {
            log.info(
                    "Verified runtime model override support for provider {} ({} -> {})",
                    provider,
                    settings.models().primary(),
                    settings.models().fallback());
        }
    }

    private ModelReply invokeModel(
            ChatbotSettings settings,
            String model,
            String prompt,
            ChatbotSession session,
            List<Document> context,
            String contextSummary,
            Map<String, String> metadata) {
        Prompt requestPrompt =
                buildPrompt(settings, model, prompt, session, context, contextSummary, metadata);
        ChatResponse response;
        try {
            response = chatModel.call(requestPrompt);
        } catch (org.eclipse.jetty.client.HttpResponseException ex) {
            throw new ChatbotException(
                    "Chat model rejected the request: " + sanitizeRemoteMessage(ex.getMessage()),
                    ex);
        } catch (RuntimeException ex) {
            throw new ChatbotException(
                    "Failed to contact chat model provider: "
                            + sanitizeRemoteMessage(ex.getMessage()),
                    ex);
        }
        long promptTokens = 0L;
        long completionTokens = 0L;
        long totalTokens = 0L;
        if (response != null && response.getMetadata() != null) {
            org.springframework.ai.chat.metadata.Usage usage = response.getMetadata().getUsage();
            if (usage != null) {
                promptTokens = toLong(usage.getPromptTokens());
                completionTokens = toLong(usage.getCompletionTokens());
                totalTokens =
                        usage.getTotalTokens() != null
                                ? usage.getTotalTokens()
                                : promptTokens + completionTokens;
            }
        }
        String content =
                Optional.ofNullable(response)
                        .map(ChatResponse::getResults)
                        .filter(results -> !results.isEmpty())
                        .map(results -> results.get(0).getOutput().getText())
                        .orElse("");
        return parseModelResponse(content, promptTokens, completionTokens, totalTokens);
    }

    private Prompt buildPrompt(
            ChatbotSettings settings,
            String model,
            String question,
            ChatbotSession session,
            List<Document> context,
            String contextSummary,
            Map<String, String> metadata) {
        String chunkOutline = buildChunkOutline(context);
        String metadataSummary =
                metadata.entrySet().stream()
                        .map(entry -> entry.getKey() + ": " + entry.getValue())
                        .reduce((left, right) -> left + ", " + right)
                        .orElse("none");

        String imageDirective =
                session.isImageContentDetected()
                        ? "Images were detected in this PDF. You must explain that image analysis is not available."
                        : "No images detected in this PDF.";

        String systemPrompt =
                "You are Stirling PDF Bot. Use provided context strictly. "
                        + "Respond in compact JSON with fields answer (string), confidence (0..1), requiresEscalation (boolean), rationale (string). "
                        + "Explain limitations when context insufficient. Always note that image analysis is not supported yet.";

        String userPrompt =
                "Document metadata: "
                        + metadataSummary
                        + "\nOCR applied: "
                        + session.isOcrRequested()
                        + "\n"
                        + imageDirective
                        + "\nContext summary:\n"
                        + contextSummary
                        + "\nContext outline:\n"
                        + chunkOutline
                        + "Question: "
                        + question;

        OpenAiChatOptions options = buildChatOptions(settings, model);

        return new Prompt(
                List.of(new SystemMessage(systemPrompt), new UserMessage(userPrompt)), options);
    }

    private OpenAiChatOptions buildChatOptions(ChatbotSettings settings, String model) {
        OpenAiChatOptions.Builder builder = OpenAiChatOptions.builder().model(model);
        String normalizedModel = model == null ? "" : model.toLowerCase();
        boolean reasoningModel = normalizedModel.startsWith("gpt-5-");
        if (!reasoningModel) {
            builder.temperature(settings.models().temperature()).topP(settings.models().topP());
        }
        return builder.build();
    }

    private String buildChunkOutline(List<Document> context) {
        if (context == null || context.isEmpty()) {
            return "No chunks retrieved for this question.";
        }
        StringBuilder outline = new StringBuilder();
        for (Document chunk : context) {
            String order = chunk.getMetadata().getOrDefault("chunkOrder", "?").toString();
            String snippet = chunk.getText();
            if (snippet != null) {
                snippet = snippet.replaceAll("\\s+", " ").trim();
                if (snippet.length() > 240) {
                    snippet = snippet.substring(0, 237) + "...";
                }
            } else {
                snippet = "(empty)";
            }
            outline.append("- Chunk ").append(order).append(": ").append(snippet).append("\n");
        }
        return outline.toString();
    }

    private ModelReply parseModelResponse(
            String raw, long promptTokens, long completionTokens, long totalTokens) {
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
            return new ModelReply(
                    answer,
                    confidence,
                    requiresEscalation,
                    rationale,
                    promptTokens,
                    completionTokens,
                    totalTokens);
        } catch (IOException ex) {
            log.warn("Failed to parse model JSON response, returning raw text", ex);
            return new ModelReply(
                    raw,
                    0.0D,
                    true,
                    "Unable to parse JSON response",
                    promptTokens,
                    completionTokens,
                    totalTokens);
        }
    }

    private record ModelReply(
            String answer,
            double confidence,
            boolean requiresEscalation,
            String rationale,
            long promptTokens,
            long completionTokens,
            long totalTokens) {}

    private String sanitizeRemoteMessage(String message) {
        if (!StringUtils.hasText(message)) {
            return "unexpected provider error";
        }
        return message.replaceAll("(?i)api[-_ ]?key\\s*=[^\\s]+", "api-key=***");
    }

    private long toLong(Integer value) {
        return value == null ? 0L : value.longValue();
    }
}
