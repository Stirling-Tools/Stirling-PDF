package stirling.software.proprietary.service.chatbot;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

import org.springframework.ai.embedding.EmbeddingModel;
import org.springframework.ai.embedding.EmbeddingResponse;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.util.CollectionUtils;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.model.chatbot.ChatbotDocumentCacheEntry;
import stirling.software.proprietary.model.chatbot.ChatbotTextChunk;
import stirling.software.proprietary.service.chatbot.ChatbotFeatureProperties.ChatbotSettings;
import stirling.software.proprietary.service.chatbot.exception.ChatbotException;

@Service
@RequiredArgsConstructor
@Slf4j
@ConditionalOnProperty(value = "premium.proFeatures.chatbot.enabled", havingValue = "true")
public class ChatbotRetrievalService {

    private final ChatbotCacheService cacheService;
    private final EmbeddingModel embeddingModel;

    public List<ChatbotTextChunk> retrieveTopK(
            String sessionId, String query, ChatbotSettings settings) {
        ChatbotDocumentCacheEntry entry =
                cacheService
                        .resolveBySessionId(sessionId)
                        .orElseThrow(() -> new ChatbotException("Unknown chatbot session"));
        List<ChatbotTextChunk> chunks = entry.getChunks();
        if (CollectionUtils.isEmpty(chunks)) {
            throw new ChatbotException("Chatbot cache does not contain pre-computed chunks");
        }
        List<Double> queryEmbedding = computeQueryEmbedding(query);
        List<ScoredChunk> scoredChunks = new ArrayList<>();
        for (ChatbotTextChunk chunk : chunks) {
            if (CollectionUtils.isEmpty(chunk.getEmbedding())) {
                log.warn("Chunk {} missing embedding, skipping", chunk.getId());
                continue;
            }
            double score = cosineSimilarity(queryEmbedding, chunk.getEmbedding());
            scoredChunks.add(new ScoredChunk(chunk, score));
        }
        return scoredChunks.stream()
                .sorted(Comparator.comparingDouble(ScoredChunk::score).reversed())
                .limit(Math.max(settings.rag().topK(), 1))
                .map(ScoredChunk::chunk)
                .toList();
    }

    private List<Double> computeQueryEmbedding(String query) {
        EmbeddingResponse response = embeddingModel.embedForResponse(List.of(query));
        float[] embeddingArray =
                Optional.ofNullable(response.getResults().stream().findFirst().orElse(null))
                        .map(org.springframework.ai.embedding.Embedding::getOutput)
                        .orElseThrow(
                                () -> new ChatbotException("Failed to compute query embedding"));
        List<Double> embedding = new ArrayList<>(embeddingArray.length);
        for (float value : embeddingArray) {
            embedding.add((double) value);
        }
        return embedding;
    }

    private double cosineSimilarity(List<Double> v1, List<Double> v2) {
        int size = Math.min(v1.size(), v2.size());
        if (size == 0) {
            return -1.0;
        }
        double dot = 0.0;
        double mag1 = 0.0;
        double mag2 = 0.0;
        for (int i = 0; i < size; i++) {
            double a = v1.get(i);
            double b = v2.get(i);
            dot += a * b;
            mag1 += a * a;
            mag2 += b * b;
        }
        if (mag1 == 0.0 || mag2 == 0.0) {
            return -1.0;
        }
        return dot / (Math.sqrt(mag1) * Math.sqrt(mag2));
    }

    private record ScoredChunk(ChatbotTextChunk chunk, double score) {}
}
