package stirling.software.proprietary.service.chatbot;

import java.util.List;

import org.springframework.ai.document.Document;
import org.springframework.stereotype.Component;
import org.springframework.util.CollectionUtils;

@Component
public class ChatbotContextCompressor {

    private static final int DEFAULT_SUMMARY_LIMIT = 3000;
    private static final int MIN_CHUNK_SNIPPET = 160;

    public String summarize(List<Document> documents, int requestedLimit) {
        if (CollectionUtils.isEmpty(documents)) {
            return "No contextual snippets available for this session.";
        }
        int maxChars =
                requestedLimit > 0
                        ? Math.min(requestedLimit, DEFAULT_SUMMARY_LIMIT)
                        : DEFAULT_SUMMARY_LIMIT;
        StringBuilder builder = new StringBuilder();
        int perChunkLimit = Math.max(MIN_CHUNK_SNIPPET, maxChars / Math.max(documents.size(), 1));
        for (Document doc : documents) {
            if (builder.length() >= maxChars) {
                break;
            }
            String chunkOrder = doc.getMetadata().getOrDefault("chunkOrder", "?").toString();
            String text = trimContent(doc.getText(), perChunkLimit);
            builder.append("Chunk ").append(chunkOrder).append(": ").append(text).append('\n');
        }
        if (builder.length() == 0) {
            return "Unable to summarise context; original content unavailable.";
        }
        return builder.substring(0, Math.min(builder.length(), maxChars)).trim();
    }

    private String trimContent(String content, int perChunkLimit) {
        if (content == null || content.isBlank()) {
            return "(empty chunk)";
        }
        String normalized = content.replaceAll("\\s+", " ").trim();
        if (normalized.length() <= perChunkLimit) {
            return normalized;
        }
        return normalized.substring(0, Math.max(0, perChunkLimit - 3)) + "...";
    }
}
