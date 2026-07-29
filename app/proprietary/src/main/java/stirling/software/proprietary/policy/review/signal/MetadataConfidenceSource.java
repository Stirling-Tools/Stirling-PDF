package stirling.software.proprietary.policy.review.signal;

import java.util.ArrayList;
import java.util.List;

import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.service.PdfMetadataService;
import stirling.software.proprietary.policy.review.PdfInfoKeyReader;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * The zero-wiring route for any tool that wants review to act on how sure it was: write {@link
 * PdfMetadataService#SIGNALS_KEY} onto the output as a JSON array of
 *
 * <pre>{"producer": "ocr", "subject": "page 3", "confidence": 0.42, "detail": "faint scan"}</pre>
 *
 * <p>Only {@code producer} and a 0..1 {@code confidence} are required; entries missing either are
 * skipped rather than guessed at. Nothing else needs to change — the low-confidence rule already
 * consults every {@link ConfidenceSignalSource}, so the tool's signal starts holding files the day
 * it starts writing them.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class MetadataConfidenceSource implements ConfidenceSignalSource {

    public static final String PRODUCER = "metadata";

    private final PdfInfoKeyReader keyReader;
    private final ObjectMapper objectMapper;

    /**
     * Signals read here keep the producer each entry declares, not this bean's name — it is a
     * carrier for other tools, not a producer in its own right.
     */
    @Override
    public String producer() {
        return PRODUCER;
    }

    @Override
    public List<ConfidenceSignal> read(Resource output) {
        return keyReader
                .read(output, PdfMetadataService.SIGNALS_KEY)
                .map(this::parseQuietly)
                .orElseGet(List::of);
    }

    private List<ConfidenceSignal> parseQuietly(String json) {
        try {
            return parse(json);
        } catch (RuntimeException e) {
            log.warn("Ignoring unreadable {}: {}", PdfMetadataService.SIGNALS_KEY, e.getMessage());
            return List.of();
        }
    }

    private List<ConfidenceSignal> parse(String json) {
        List<ConfidenceSignal> signals = new ArrayList<>();
        for (JsonNode node : objectMapper.readTree(json)) {
            String producer = node.path("producer").asString(null);
            JsonNode confidence = node.path("confidence");
            if (producer == null || producer.isBlank() || !confidence.isNumber()) {
                continue;
            }
            double value = confidence.asDouble();
            if (value < 0 || value > 1) {
                continue;
            }
            signals.add(
                    new ConfidenceSignal(
                            producer,
                            node.path("subject").asString(null),
                            value,
                            node.path("detail").asString(null)));
        }
        return signals;
    }
}
