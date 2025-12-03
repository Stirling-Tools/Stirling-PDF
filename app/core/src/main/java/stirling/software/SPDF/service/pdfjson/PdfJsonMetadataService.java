package stirling.software.SPDF.service.pdfjson;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.Base64;
import java.util.Calendar;
import java.util.Optional;
import java.util.TimeZone;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.apache.pdfbox.pdmodel.common.PDMetadata;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.json.PdfJsonMetadata;

/** Service for extracting and applying PDF metadata (document info and XMP) for JSON conversion. */
@Service
@Slf4j
public class PdfJsonMetadataService {

    /**
     * Extracts document information metadata from a PDF.
     *
     * @param document The PDF document
     * @return Metadata model with document info
     */
    public PdfJsonMetadata extractMetadata(PDDocument document) {
        PdfJsonMetadata metadata = new PdfJsonMetadata();
        PDDocumentInformation info = document.getDocumentInformation();
        if (info != null) {
            metadata.setTitle(info.getTitle());
            metadata.setAuthor(info.getAuthor());
            metadata.setSubject(info.getSubject());
            metadata.setKeywords(info.getKeywords());
            metadata.setCreator(info.getCreator());
            metadata.setProducer(info.getProducer());
            metadata.setCreationDate(formatCalendar(info.getCreationDate()));
            metadata.setModificationDate(formatCalendar(info.getModificationDate()));
            metadata.setTrapped(info.getTrapped());
        }
        metadata.setNumberOfPages(document.getNumberOfPages());
        return metadata;
    }

    /**
     * Extracts XMP metadata from a PDF as base64-encoded string.
     *
     * @param document The PDF document
     * @return Base64-encoded XMP metadata, or null if not present
     */
    public String extractXmpMetadata(PDDocument document) {
        if (document.getDocumentCatalog() == null) {
            return null;
        }
        PDMetadata metadata = document.getDocumentCatalog().getMetadata();
        if (metadata == null) {
            return null;
        }
        try (InputStream inputStream = metadata.createInputStream();
                ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            inputStream.transferTo(baos);
            byte[] data = baos.toByteArray();
            if (data.length == 0) {
                return null;
            }
            return Base64.getEncoder().encodeToString(data);
        } catch (IOException ex) {
            log.debug("Failed to extract XMP metadata: {}", ex.getMessage());
            return null;
        }
    }

    /**
     * Applies metadata to a PDF document.
     *
     * @param document The PDF document
     * @param metadata The metadata to apply
     */
    public void applyMetadata(PDDocument document, PdfJsonMetadata metadata) {
        if (metadata == null) {
            return;
        }
        PDDocumentInformation info = document.getDocumentInformation();
        info.setTitle(metadata.getTitle());
        info.setAuthor(metadata.getAuthor());
        info.setSubject(metadata.getSubject());
        info.setKeywords(metadata.getKeywords());
        info.setCreator(metadata.getCreator());
        info.setProducer(metadata.getProducer());
        if (metadata.getCreationDate() != null) {
            parseInstant(metadata.getCreationDate())
                    .ifPresent(instant -> info.setCreationDate(toCalendar(instant)));
        }
        if (metadata.getModificationDate() != null) {
            parseInstant(metadata.getModificationDate())
                    .ifPresent(instant -> info.setModificationDate(toCalendar(instant)));
        }
        info.setTrapped(metadata.getTrapped());
    }

    /**
     * Applies XMP metadata to a PDF document from base64-encoded string.
     *
     * @param document The PDF document
     * @param base64 Base64-encoded XMP metadata
     */
    public void applyXmpMetadata(PDDocument document, String base64) {
        if (base64 == null || base64.isBlank()) {
            return;
        }
        try (InputStream inputStream =
                new ByteArrayInputStream(Base64.getDecoder().decode(base64))) {
            PDMetadata metadata = new PDMetadata(document, inputStream);
            document.getDocumentCatalog().setMetadata(metadata);
        } catch (IllegalArgumentException | IOException ex) {
            log.debug("Failed to apply XMP metadata: {}", ex.getMessage());
        }
    }

    private String formatCalendar(Calendar calendar) {
        if (calendar == null) {
            return null;
        }
        return calendar.toInstant().toString();
    }

    private Optional<Instant> parseInstant(String value) {
        try {
            return Optional.of(Instant.parse(value));
        } catch (DateTimeParseException ex) {
            log.warn("Failed to parse instant '{}': {}", value, ex.getMessage());
            return Optional.empty();
        }
    }

    private Calendar toCalendar(Instant instant) {
        Calendar calendar = Calendar.getInstance(TimeZone.getTimeZone("UTC"));
        calendar.setTimeInMillis(instant.toEpochMilli());
        return calendar;
    }
}
