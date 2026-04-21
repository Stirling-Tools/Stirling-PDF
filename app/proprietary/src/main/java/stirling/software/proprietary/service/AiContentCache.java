package stirling.software.proprietary.service;

import java.util.Optional;

import org.springframework.stereotype.Service;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;

import stirling.software.proprietary.service.PdfContentExtractor.ExtractedFileText;

/**
 * Process-wide LRU cache of PDF text extractions keyed by SHA-256 of the file bytes. Lets {@link
 * AiWorkflowService} skip re-extraction when the same file content is seen in a later turn.
 */
@Service
public class AiContentCache {

    private static final int MAX_ENTRIES = 1000;

    private final Cache<String, ExtractedFileText> byHash =
            Caffeine.newBuilder().maximumSize(MAX_ENTRIES).build();

    public Optional<ExtractedFileText> get(String sha256) {
        return Optional.ofNullable(byHash.getIfPresent(sha256));
    }

    public void put(String sha256, ExtractedFileText extracted) {
        byHash.put(sha256, extracted);
    }
}
