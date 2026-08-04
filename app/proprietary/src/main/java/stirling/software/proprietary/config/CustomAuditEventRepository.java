package stirling.software.proprietary.config;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;

import org.slf4j.MDC;

import jakarta.enterprise.context.ApplicationScoped;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.model.security.PersistentAuditEvent;
import stirling.software.proprietary.repository.PersistentAuditEventRepository;
import stirling.software.proprietary.util.SecretMasker;

@ApplicationScoped
@RequiredArgsConstructor
@Slf4j
public class CustomAuditEventRepository {

    // Jackson 3 ObjectMapper as a static field - Quarkus CDI only produces com.fasterxml (Jackson
    // 2) beans; Jackson 3 is used as a plain library here for JSON serialization of audit data.
    private static final tools.jackson.databind.ObjectMapper MAPPER =
            new tools.jackson.databind.ObjectMapper();

    /** Width of the {@code principal} column; longer values are hashed so the insert can't fail. */
    private static final int PRINCIPAL_MAX_LENGTH = 255;

    private final PersistentAuditEventRepository repo;

    /* ── WRITE side ───────────────────────────────────────── */
    public void add(String principal, String type, Instant timestamp, Map<String, Object> data) {
        try {
            Map<String, Object> clean =
                    (data == null || data.isEmpty()) ? Map.of() : SecretMasker.mask(data);

            if (clean.isEmpty() || (clean.size() == 1 && clean.containsKey("details"))) {
                return;
            }
            String rid = MDC.get("requestId");
            String apiKeyLabel =
                    MDC.get(
                            stirling.software.proprietary.security.service
                                    .ApiKeyAuthenticationService.AUDIT_LABEL_MDC_KEY);

            if (rid != null || apiKeyLabel != null) {
                clean = new java.util.HashMap<>(clean);
                if (rid != null) {
                    clean.put("requestId", rid);
                }
                // Named key that made the request; surfaces as the doc source in the processor
                // feed.
                if (apiKeyLabel != null) {
                    clean.put("__apiKeyLabel", apiKeyLabel);
                }
            }

            String source = MDC.get("auditSource");

            String auditEventData = MAPPER.writeValueAsString(clean);
            log.debug("AuditEvent data (JSON): {}", auditEventData);

            PersistentAuditEvent ent =
                    PersistentAuditEvent.builder()
                            .principal(safePrincipal(principal))
                            .type(type)
                            .source(source)
                            .data(auditEventData)
                            .timestamp(timestamp)
                            .build();
            repo.persist(ent);
        } catch (Exception e) {
            log.error("Failed to persist audit event (fail-open); type={}", type, e);
        }
    }

    /**
     * Hash JWT-shaped or over-long principals so the insert fits the column and stores no secret.
     */
    static String safePrincipal(String principal) {
        if (principal == null || principal.isBlank()) {
            return "anonymous";
        }
        // Hash JWTs ("eyJ...") and any over-long value rather than store verbatim.
        if (principal.startsWith("eyJ") || principal.length() > PRINCIPAL_MAX_LENGTH) {
            return "token:" + sha256Prefix(principal);
        }
        return principal;
    }

    /** First 8 bytes of SHA-256 as hex: stable, one-way, collision-safe enough. */
    private static String sha256Prefix(String value) {
        try {
            byte[] digest =
                    MessageDigest.getInstance("SHA-256")
                            .digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest, 0, 8);
        } catch (NoSuchAlgorithmException e) {
            return "unhashable";
        }
    }

    /* ── READ side intentionally inert (endpoint disabled) ──
     * Original find(String, Instant, String) returned List.of(); the Actuator read endpoint was
     * disabled. Re-add a typed read method here if an audit-query endpoint is reintroduced. */
    public List<PersistentAuditEvent> find() {
        return List.of();
    }
}
