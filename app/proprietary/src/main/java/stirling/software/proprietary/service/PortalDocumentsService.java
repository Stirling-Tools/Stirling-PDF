package stirling.software.proprietary.service;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.audit.AuditEventType;
import stirling.software.proprietary.audit.PortalAuditEventRow;
import stirling.software.proprietary.model.api.documents.PortalDocAuditEventDto;
import stirling.software.proprietary.model.api.documents.PortalDocumentsResponseDto;
import stirling.software.proprietary.model.api.documents.PortalDocumentsSummaryDto;
import stirling.software.proprietary.model.api.documents.PortalReviewDocumentDto;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

/** Builds the Documents feed from audit_events: one row per file; extraction fields stay null. */
@Slf4j
@Service
@RequiredArgsConstructor
public class PortalDocumentsService {

    private static final int RETURN_LIMIT = 40;

    private final PortalAuditReadService auditReadService;
    private final ObjectMapper objectMapper;

    /** Whole-server view (admins). */
    public PortalDocumentsResponseDto serverDocuments() {
        return build(auditReadService.serverEvents());
    }

    /** Team-scoped view: only files touched by {@code principals}. */
    public PortalDocumentsResponseDto scopedDocuments(String cacheKey, List<String> principals) {
        return build(auditReadService.scopedEvents(cacheKey, principals));
    }

    private PortalDocumentsResponseDto build(List<PortalAuditEventRow> events) {
        // Events arrive newest-first; each file in a processing event is one activity row.
        Instant dayAgo = Instant.now().minus(Duration.ofDays(1));
        List<PortalReviewDocumentDto> documents = new ArrayList<>();
        int processedToday = 0;
        for (PortalAuditEventRow event : events) {
            if (documents.size() >= RETURN_LIMIT) {
                break;
            }
            if (!isFileBearing(event.type())) {
                continue;
            }
            Map<String, Object> data = parseData(event);
            Object files = data.get("files");
            if (!(files instanceof List<?> fileList)) {
                continue;
            }
            String path = asString(data.get("path"));
            String origin = asString(data.get("__origin"));
            String source = sourceLabel(origin, asString(data.get("__apiKeyLabel")));
            String product = "API".equals(origin) ? "API" : "Editor";
            String action = prettyTool(path);
            boolean failed = isFailure(data);
            Instant ts = event.timestamp();
            long eventId = event.id();
            int idx = 0;
            for (Object f : fileList) {
                if (documents.size() >= RETURN_LIMIT) {
                    break;
                }
                if (!(f instanceof Map<?, ?> fileMap)) {
                    continue;
                }
                String name = asString(fileMap.get("name"));
                if (name == null || name.isBlank()) {
                    continue;
                }
                documents.add(
                        toDocument(
                                eventId + "-" + idx++,
                                name,
                                asString(fileMap.get("type")),
                                product,
                                action,
                                event.principal(),
                                failed,
                                source,
                                ts));
                if (!failed && ts != null && ts.isAfter(dayAgo)) {
                    processedToday++;
                }
            }
        }

        int processed =
                (int) documents.stream().filter(d -> "processed".equals(d.getStatus())).count();
        int errors = documents.size() - processed;

        PortalDocumentsSummaryDto summary =
                PortalDocumentsSummaryDto.builder()
                        .totalInQueue(documents.size())
                        .processed(processed)
                        .errors(errors)
                        .processedToday(processedToday)
                        .build();

        return PortalDocumentsResponseDto.builder().summary(summary).documents(documents).build();
    }

    /** Build one activity row from a single file inside one processing event. */
    private PortalReviewDocumentDto toDocument(
            String rowId,
            String name,
            String contentType,
            String product,
            String action,
            String user,
            boolean failed,
            String source,
            Instant timestamp) {
        PortalDocAuditEventDto op =
                PortalDocAuditEventDto.builder()
                        .id(rowId + "-op")
                        .kind(failed ? "flagged" : "extracted")
                        .time(relativeTime(timestamp))
                        .actor(user)
                        .detail(failed ? action + " failed" : action + " via " + source)
                        .build();

        return PortalReviewDocumentDto.builder()
                .id("doc-" + rowId)
                .name(name)
                .type(docType(contentType, name))
                .product(product)
                .action(action)
                .user(user)
                .status(failed ? "error" : "processed")
                .source(source)
                .confidence(null)
                .fieldsExtracted(0)
                .time(relativeTime(timestamp))
                // Audit events don't reveal content sensitivity, so never guess it.
                .sensitive(false)
                .extractions(List.of())
                .audit(List.of(op))
                .build();
    }

    private static boolean isFileBearing(String type) {
        return AuditEventType.PDF_PROCESS.name().equals(type)
                || AuditEventType.FILE_OPERATION.name().equals(type);
    }

    private static boolean isFailure(Map<String, Object> data) {
        Object status = data.get("status");
        if (status instanceof String s && "failure".equalsIgnoreCase(s)) {
            return true;
        }
        Object code = data.get("statusCode");
        return code instanceof Number n && n.intValue() >= 400;
    }

    private static String sourceLabel(String origin, String apiKeyLabel) {
        if ("API".equals(origin)) {
            // Attribute to the specific named key when known, else the generic API channel.
            return apiKeyLabel != null && !apiKeyLabel.isBlank()
                    ? "API key · " + apiKeyLabel
                    : "API integration";
        }
        if ("SYSTEM".equals(origin)) {
            return "System";
        }
        return "Web upload";
    }

    private static String docType(String contentType, String name) {
        String ct = contentType == null ? "" : contentType.toLowerCase(Locale.ROOT);
        if (ct.contains("pdf") || name.toLowerCase(Locale.ROOT).endsWith(".pdf")) {
            return "PDF";
        }
        if (ct.startsWith("image/") || name.matches("(?i).*\\.(png|jpe?g|gif|webp|tiff?)$")) {
            return "Image";
        }
        if (ct.contains("word") || name.matches("(?i).*\\.docx?$")) {
            return "Word";
        }
        return "Document";
    }

    private static String prettyTool(String path) {
        if (path == null || path.isBlank()) {
            return "Processed";
        }
        String[] parts = path.split("/");
        // Convert endpoints are /convert/{from}/{to}; label them as a conversion.
        for (int i = 0; i + 2 < parts.length; i++) {
            if ("convert".equals(parts[i]) && !parts[i + 1].isEmpty() && !parts[i + 2].isEmpty()) {
                return "Convert " + prettyWords(parts[i + 1]) + " to " + prettyWords(parts[i + 2]);
            }
        }
        String last = parts.length > 0 ? parts[parts.length - 1] : path;
        String pretty = prettyWords(last);
        return pretty.isEmpty() ? "Processed" : pretty;
    }

    /** Title-case a hyphenated path segment, upper-casing known acronyms. */
    private static String prettyWords(String segment) {
        StringBuilder sb = new StringBuilder();
        for (String word : segment.split("-")) {
            if (word.isEmpty()) {
                continue;
            }
            if (sb.length() > 0) {
                sb.append(' ');
            }
            String lower = word.toLowerCase(Locale.ROOT);
            sb.append(
                    switch (lower) {
                        case "pdf" -> "PDF";
                        case "pdfs" -> "PDFs";
                        case "ocr" -> "OCR";
                        case "img" -> "Image";
                        case "csv" -> "CSV";
                        default -> Character.toUpperCase(word.charAt(0)) + word.substring(1);
                    });
        }
        return sb.toString();
    }

    private static String relativeTime(Instant ts) {
        if (ts == null) {
            return "";
        }
        long seconds = Duration.between(ts, Instant.now()).getSeconds();
        if (seconds < 60) {
            return "just now";
        }
        long minutes = seconds / 60;
        if (minutes < 60) {
            return minutes + "m ago";
        }
        long hours = minutes / 60;
        if (hours < 24) {
            return hours + "h ago";
        }
        return (hours / 24) + "d ago";
    }

    private Map<String, Object> parseData(PortalAuditEventRow event) {
        if (event.data() == null || event.data().isEmpty()) {
            return Map.of();
        }
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> parsed = objectMapper.readValue(event.data(), Map.class);
            // A literal "null" payload parses to null; treat it as empty, not an NPE.
            return parsed == null ? Map.of() : parsed;
        } catch (JacksonException e) {
            log.warn("Failed to parse audit event {} data as JSON", event.id());
            return Map.of();
        }
    }

    private static String asString(Object o) {
        return o == null ? null : String.valueOf(o);
    }
}
