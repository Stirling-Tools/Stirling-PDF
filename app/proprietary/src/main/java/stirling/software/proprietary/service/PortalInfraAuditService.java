package stirling.software.proprietary.service;

import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.audit.AuditEventType;
import stirling.software.proprietary.audit.PortalAuditEventRow;
import stirling.software.proprietary.model.api.audit.InfraAuditEventDto;
import stirling.software.proprietary.model.api.audit.InfraAuditLogResponse;
import stirling.software.proprietary.model.api.audit.InfraAuditSummary;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

/** Maps cached audit_events to the Infrastructure → Audit tab, dropping read-noise types. */
@Slf4j
@Service
@RequiredArgsConstructor
public class PortalInfraAuditService {

    /** Rows returned to the tab after filtering. */
    private static final int RETURN_LIMIT = 40;

    private static final DateTimeFormatter TS_FORMAT =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss").withZone(ZoneOffset.UTC);

    private final PortalAuditReadService auditReadService;
    private final ObjectMapper objectMapper;

    /** Whole-server view (admins). */
    public InfraAuditLogResponse serverAuditLog() {
        return buildFromEvents(auditReadService.serverEvents(), true);
    }

    /** Team-scoped view: only events by the given principals; empty yields an empty log. */
    public InfraAuditLogResponse scopedAuditLog(String cacheKey, List<String> principals) {
        return buildFromEvents(auditReadService.scopedEvents(cacheKey, principals), false);
    }

    private InfraAuditLogResponse buildFromEvents(
            List<PortalAuditEventRow> recent, boolean fullServer) {
        List<InfraAuditEventDto> events =
                recent.stream()
                        .filter(e -> isInfraRelevant(e.type()))
                        .map(this::toDto)
                        .limit(RETURN_LIMIT)
                        .toList();

        int policy = (int) events.stream().filter(e -> "policy".equals(e.getCategory())).count();
        int processing =
                (int) events.stream().filter(e -> "processing".equals(e.getCategory())).count();
        int elevation =
                (int) events.stream().filter(e -> "elevation".equals(e.getCategory())).count();
        int config = (int) events.stream().filter(e -> "config".equals(e.getCategory())).count();

        InfraAuditSummary summary =
                InfraAuditSummary.builder()
                        .totalEvents(events.size())
                        .policy(policy)
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

    private InfraAuditEventDto toDto(PortalAuditEventRow event) {
        Map<String, Object> data = parseData(event);
        String path = asString(data.get("path"));
        String policyName = asString(data.get("policyName"));
        boolean automation = isAutomation(data);
        // Classify a dispatch by its real run-path URI, not a policyName: the latter can be spoofed
        // via the X-Stirling-Policy-Name header to make a direct call pose as a policy row.
        boolean policyDispatch = isPolicyRunPath(path) && !automation;
        // A dispatch is its own "policy" category so the UI badges it as a policy run, not a
        // generic processing op; its internal steps keep their real tool category.
        String category = policyDispatch ? "policy" : categoryFor(event.type(), path);

        return InfraAuditEventDto.builder()
                .id(String.valueOf(event.id()))
                .timestamp(event.timestamp() == null ? "" : TS_FORMAT.format(event.timestamp()))
                .category(category)
                .action(actionFor(event.type(), path, policyName, automation))
                .actor(event.principal())
                .target(targetFor(category, path, data, policyDispatch))
                .status(statusFor(event.type(), category, data))
                .latencyMs(asLong(data.get("latencyMs")))
                .build();
    }

    private static boolean isAutomation(Map<String, Object> data) {
        Object v = data.get("automation");
        return Boolean.TRUE.equals(v) || "true".equalsIgnoreCase(String.valueOf(v));
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

    /**
     * Label for a row. A genuine policy dispatch (a {@code /policies/.../run} request) shows the
     * policy it ran; an internal pipeline step (automation marker) is flagged so it isn't read as a
     * direct action. The name is only shown as the action on a real run URI, so a spoofed
     * X-Stirling-Policy-Name header on a direct tool call can't overwrite its true action.
     */
    private static String actionFor(
            String type, String path, String policyName, boolean automation) {
        if (!automation && isPolicyRunPath(path)) {
            // A run with no name (ad-hoc pipeline) still reads better than the "run" endpoint.
            return policyName != null ? policyName : "Policy run";
        }
        String base = baseActionFor(type, path);
        if (automation) {
            return policyName != null
                    ? base + " (policy: " + policyName + ")"
                    : base + " (automation)";
        }
        return base;
    }

    /**
     * The pipeline-run endpoints: {@code /policies/run}, {@code /run/stream}, {@code /{id}/run}.
     */
    private static boolean isPolicyRunPath(String path) {
        return path != null
                && path.contains("/policies/")
                && (path.endsWith("/run") || path.endsWith("/run/stream"));
    }

    private static String baseActionFor(String type, String path) {
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

    /** "Auto Redact, Compress PDF" from the run's step endpoints; first three, then "+N more". */
    private static String prettyStepList(Object steps) {
        if (!(steps instanceof List<?> list) || list.isEmpty()) {
            return null;
        }
        int shown = Math.min(3, list.size());
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < shown; i++) {
            if (i > 0) {
                sb.append(", ");
            }
            sb.append(prettyTool(asString(list.get(i))));
        }
        if (list.size() > shown) {
            sb.append(" +").append(list.size() - shown).append(" more");
        }
        return sb.toString();
    }

    private static String targetFor(
            String category, String path, Map<String, Object> data, boolean policyDispatch) {
        if (policyDispatch) {
            // The run touches no single file at this level; show the tools the policy runs instead.
            String steps = prettyStepList(data.get("policySteps"));
            return steps != null ? steps : "Pipeline";
        }
        if ("auth".equals(category)) {
            // Auth events don't act on a resource; the session is the closest thing.
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
