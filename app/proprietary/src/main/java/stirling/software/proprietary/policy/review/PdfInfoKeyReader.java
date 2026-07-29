package stirling.software.proprietary.policy.review;

import java.io.IOException;
import java.io.InputStream;
import java.util.Locale;
import java.util.Optional;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.service.CustomPDFDocumentFactory;

/**
 * Reads one Info-dict key out of a PDF the run produced. Shared by everything in review that reads
 * what a tool left behind, so the "open it, tolerate anything" behaviour lives in one place: an
 * output that can't be opened or has no such key reads as empty, never as an error, because review
 * must never turn a deliverable run into a failed one.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class PdfInfoKeyReader {

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    /** Whether the resource looks like a PDF worth opening for metadata. */
    public boolean isPdf(Resource resource) {
        String name = resource.getFilename();
        return name != null && name.toLowerCase(Locale.ROOT).endsWith(".pdf");
    }

    /** The key's raw value, or empty when absent, blank, or unreadable. */
    public Optional<String> read(Resource resource, String key) {
        if (!isPdf(resource)) {
            return Optional.empty();
        }
        try (InputStream in = resource.getInputStream();
                PDDocument document = pdfDocumentFactory.load(in, true)) {
            String value = document.getDocumentInformation().getCustomMetadataValue(key);
            return value == null || value.isBlank() ? Optional.empty() : Optional.of(value);
        } catch (IOException | RuntimeException e) {
            log.warn("Could not read {} from {}: {}", key, resource.getFilename(), e.getMessage());
            return Optional.empty();
        }
    }
}
