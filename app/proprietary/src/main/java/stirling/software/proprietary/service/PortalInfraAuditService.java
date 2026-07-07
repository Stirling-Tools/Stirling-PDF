package stirling.software.proprietary.service;

import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.audit.AuditEventType;
import stirling.software.proprietary.model.api.audit.InfraAuditEventDto;
import stirling.software.proprietary.model.api.audit.InfraAuditLogResponse;
import stirling.software.proprietary.model.api.audit.InfraAuditSummary;
import stirling.software.proprietary.model.security.PersistentAuditEvent;
import stirling.software.proprietary.repository.PersistentAuditEventRepository;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

/**
 * Builds the portal Infrastructure → Audit tab view from real {@code audit_events} rows.
 *
 * <p>The raw audit types ({@link AuditEventType}) are mapped to the tab's display categories
 * (auth/config/processing/security) and the read-noise types (UI_DATA, HTTP_REQUEST) are dropped.
 * The result is cached ({@code portalInfraAuditLog}, short TTL - see CacheConfig) so the tab does
 * not hit the database on every load.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PortalInfraAuditService {

    /** Cache name - registered with a short TTL in CacheConfig. */
    public static final String CACHE_NAME = "portalInfraAuditLog";

    /** Newest candidate rows to scan (before filtering out read-noise). */
    private static final int SCAN_LIMIT = 200;

    /** Rows returned to the tab after filtering. */
    private static final int RETURN_LIMIT = 40;

    private static final DateTimeFormatter TS_FORMAT =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss").withZone(ZoneOffset.UTC);

    private final PersistentAuditEventRepository auditRepository;
    private final ObjectMapper objectMapper;

    /** Whole-server view (admins). Cached under the {@code "server"} key. */
    @Cacheable(value = CACHE_NAME, key = "'server'")
    public InfraAuditLogResponse serverAuditLog() {
        return buildFromEvents(auditRepository.findAll(recentPage()).getContent(), true);
    }

    /**
     * Team-scoped view: only events whose principal is in {@code principals} (a team's member
     * emails). Cached per {@code cacheKey} (e.g. {@code "team:42"}) so a team leader's repeated
     * loads don't re-scan the DB. An empty principal set yields an empty log rather than a query.
     */
    @Cacheable(value = CACHE_NAME, key = "#cacheKey")
    public InfraAuditLogResponse scopedAuditLog(String cacheKey, List<String> principals) {
        if (principals.isEmpty()) {
            return buildFromEvents(List.of(), false);
        }
        return buildFromEvents(
                auditRepository.findByPrincipalIn(principals, recentPage()).getContent(), false);
    }

    private static PageRequest recentPage() {
        return PageRequest.of(0, SCAN_LIMIT, Sort.by(Sort.Direction.DESC, "timestamp"));
    }

    private InfraAuditLogResponse buildFromEvents(
            List<PersistentAuditEvent> recent, boolean fullServer) {
        List<InfraAuditEventDto> events =
                recent.stream()
                        .filter(e -> isInfraRelevant(e.getType()))
                        .map(this::toDto)
                        .limit(RETURN_LIMIT)
                        .toList();

        int processing =
                (int) events.stream().filter(e -> "processing".equals(e.getCategory())).count();
        int elevation =
                (int) events.stream().filter(e -> "elevation".equals(e.getCategory())).count();
        int config = (int) events.stream().filter(e -> "config".equals(e.getCategory())).count();

        InfraAuditSummary summary =
                InfraAuditSummary.builder()
                        .totalEvents(events.size())
                        .processing(processing)
                        .elevation(elevation)
                        .config(config)
                        .build();

        return InfraAuditLogResponse.builder()
                .summary(summary)
                .events(events)
                .fullServer(fullServer)
                .build();
    }

    /** UI_DATA and HTTP_REQUEST are read/polling noise - excluded from the infrastructure view. */
    private static boolean isInfraRelevant(String type) {
        return !AuditEventType.UI_DATA.name().equals(type)
                && !AuditEventType.HTTP_REQUEST.name().equals(type);
    }

    private InfraAuditEventDto toDto(PersistentAuditEvent event) {
        Map<String, Object> data = parseData(event);
        String path = asString(data.get("path"));
        String category = categoryFor(event.getType(), path);

        return InfraAuditEventDto.builder()
                .id(String.valueOf(event.getId()))
                .timestamp(
                        event.getTimestamp() == null ? "" : TS_FORMAT.format(event.getTimestamp()))
                .category(category)
                .action(actionFor(event.getType(), path))
                .actor(event.getPrincipal())
                .target(targetFor(category, path, data))
                .status(statusFor(event.getType(), category, data))
                .latencyMs(asLong(data.get("latencyMs")))
                .build();
    }

    private Map<String, Object> parseData(PersistentAuditEvent event) {
        if (event.getData() == null || event.getData().isEmpty()) {
            return Map.of();
        }
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> parsed = objectMapper.readValue(event.getData(), Map.class);
            // A literal "null" payload parses to null; treat it as empty, not an NPE.
            return parsed == null ? Map.of() : parsed;
        } catch (JacksonException e) {
            log.warn("Failed to parse audit event {} data as JSON", event.getId());
            return Map.of();
        }
    }

    private static String categoryFor(String type, String path) {
        AuditEventType t = AuditEventType.fromString(type);
        if (t == null) {
            return "processing";
        }
        return switch (t) {
            case USER_LOGIN, USER_LOGOUT, USER_FAILED_LOGIN -> "auth";
            case SETTINGS_CHANGED, USER_PROFILE_UPDATE -> "config";
            case PDF_PROCESS, FILE_OPERATION -> isSecurityPath(path) ? "security" : "processing";
            // UI_DATA / HTTP_REQUEST are filtered out before mapping.
            default -> "processing";
        };
    }

    private static boolean isSecurityPath(String path) {
        if (path == null) {
            return false;
        }
        String p = path.toLowerCase(Locale.ROOT);
        return p.contains("/security/")
                || p.contains("password")
                || p.contains("watermark")
                || p.contains("sign")
                || p.contains("cert")
                || p.contains("redact");
    }

    private static String actionFor(String type, String path) {
        AuditEventType t = AuditEventType.fromString(type);
        if (t == null) {
            return prettyTool(path);
        }
        return switch (t) {
            case USER_LOGIN -> "User signed in";
            case USER_LOGOUT -> "User signed out";
            case USER_FAILED_LOGIN -> "Failed sign-in attempt";
            case USER_PROFILE_UPDATE -> "Profile settings updated";
            case SETTINGS_CHANGED -> "Admin settings changed";
            case PDF_PROCESS, FILE_OPERATION -> prettyTool(path);
            default -> prettyTool(path);
        };
    }

    /** Acronyms/tokens that get special casing when title-casing a tool path. */
    private static final Map<String, String> WORD_FIXUPS =
            Map.of(
                    "pdf", "PDF",
                    "pdfs", "PDFs",
                    "ocr", "OCR",
                    "img", "Image",
                    "csv", "CSV",
                    "html", "HTML",
                    "url", "URL",
                    "xml", "XML");

    /** "/api/v1/misc/compress-pdf" → "Compress PDF"; "merge-pdfs" → "Merge PDFs". */
    private static String prettyTool(String path) {
        if (path == null || path.isBlank()) {
            return "PDF operation";
        }
        String[] parts = path.split("/");
        String last = parts.length > 0 ? parts[parts.length - 1] : path;
        StringBuilder sb = new StringBuilder();
        for (String word : last.split("-")) {
            if (word.isEmpty()) {
                continue;
            }
            if (sb.length() > 0) {
                sb.append(' ');
            }
            String lower = word.toLowerCase(Locale.ROOT);
            sb.append(
                    WORD_FIXUPS.getOrDefault(
                            lower, Character.toUpperCase(word.charAt(0)) + word.substring(1)));
        }
        return sb.isEmpty() ? "PDF operation" : sb.toString();
    }

    private static String targetFor(String category, String path, Map<String, Object> data) {
        if ("auth".equals(category)) {
            // Auth events don't act on a resource - the session is the closest thing.
            // (The client IP lives in the raw audit data if it's ever needed.)
            return "Web session";
        }
        if ("config".equals(category)) {
            return path != null && !path.isBlank() ? path : "System settings";
        }
        // processing / security: prefer the first affected file name.
        String file = firstFileName(data);
        if (file != null) {
            return file;
        }
        return path != null && !path.isBlank() ? prettyTool(path) : "Document";
    }

    private static String statusFor(String type, String category, Map<String, Object> data) {
        if (AuditEventType.USER_FAILED_LOGIN.name().equals(type)) {
            return "danger";
        }
        String status = asString(data.get("status"));
        Integer code = asInteger(data.get("statusCode"));
        if ("failure".equalsIgnoreCase(status) || (code != null && code >= 500)) {
            return "danger";
        }
        if (code != null && code >= 400) {
            return "warning";
        }
        if ("config".equals(category)) {
            return "info";
        }
        return "success";
    }

    @SuppressWarnings("unchecked")
    private static String firstFileName(Map<String, Object> data) {
        Object files = data.get("files");
        if (files instanceof List<?> list
                && !list.isEmpty()
                && list.get(0) instanceof Map<?, ?> f) {
            Object name = ((Map<String, Object>) f).get("name");
            return name != null ? String.valueOf(name) : null;
        }
        return null;
    }

    private static String asString(Object o) {
        return o == null ? null : String.valueOf(o);
    }

    private static long asLong(Object o) {
        return o instanceof Number n ? n.longValue() : 0L;
    }

    private static Integer asInteger(Object o) {
        return o instanceof Number n ? n.intValue() : null;
    }
}
