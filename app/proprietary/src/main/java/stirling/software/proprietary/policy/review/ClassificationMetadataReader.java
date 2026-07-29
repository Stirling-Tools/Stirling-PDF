package stirling.software.proprietary.policy.review;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.PdfMetadataService;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Reads back what the classify tool wrote into a PDF's {@code StirlingPDFClassification} Info-dict
 * key (the engine's response JSON, verbatim). Returns empty when the key is absent — meaning no
 * classify step ran on the file — which callers must distinguish from "classified but unlabelled"
 * (a present outcome with no assignments).
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ClassificationMetadataReader {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final ObjectMapper objectMapper;

    /** Whether the resource looks like a PDF worth opening for metadata. */
    public boolean isPdf(Resource resource) {
        String name = resource.getFilename();
        return name != null && name.toLowerCase(Locale.ROOT).endsWith(".pdf");
    }

    public Optional<ClassificationOutcome> read(Resource resource) {
        if (!isPdf(resource)) {
            return Optional.empty();
        }
        try (InputStream in = resource.getInputStream();
                PDDocument document = pdfDocumentFactory.load(in, true)) {
            String json =
                    document.getDocumentInformation()
                            .getCustomMetadataValue(PdfMetadataService.CLASSIFICATION_KEY);
            if (json == null || json.isBlank()) {
                return Optional.empty();
            }
            return Optional.of(parse(json));
        } catch (IOException | RuntimeException e) {
            // An unreadable output must not fail the run; it just can't feed label rules.
            log.warn(
                    "Could not read classification metadata from {}: {}",
                    resource.getFilename(),
                    e.getMessage());
            return Optional.empty();
        }
    }

    /**
     * Tolerant parse of the engine's response JSON. New documents carry {@code assignments} with
     * confidences; documents labelled before confidences existed carry only {@code labels}, which
     * map to assignments with an unknown (null) confidence.
     */
    private ClassificationOutcome parse(String json) {
        JsonNode root = objectMapper.readTree(json);
        List<LabelScore> assignments = new ArrayList<>();
        JsonNode assignmentsNode = root.path("assignments");
        if (assignmentsNode.isArray() && !assignmentsNode.isEmpty()) {
            for (JsonNode node : assignmentsNode) {
                String labelId = node.path("labelId").asString(null);
                if (labelId != null && !labelId.isBlank()) {
                    assignments.add(new LabelScore(labelId, confidenceOf(node)));
                }
            }
        } else {
            for (JsonNode node : root.path("labels")) {
                String labelId = node.asString(null);
                if (labelId != null && !labelId.isBlank()) {
                    assignments.add(new LabelScore(labelId, null));
                }
            }
        }
        List<ConsideredLabel> considered = new ArrayList<>();
        for (JsonNode node : root.path("considered")) {
            String labelId = node.path("labelId").asString(null);
            if (labelId != null && !labelId.isBlank()) {
                considered.add(
                        new ConsideredLabel(
                                labelId, confidenceOf(node), node.path("reason").asString(null)));
            }
        }
        return new ClassificationOutcome(assignments, considered);
    }

    private static Double confidenceOf(JsonNode node) {
        JsonNode confidence = node.path("confidence");
        return confidence.isNumber() ? confidence.asDouble() : null;
    }
}
