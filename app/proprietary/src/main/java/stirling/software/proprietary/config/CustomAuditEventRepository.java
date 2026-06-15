package stirling.software.proprietary.config;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;

import org.slf4j.MDC;
import org.springframework.boot.actuate.audit.AuditEvent;
import org.springframework.boot.actuate.audit.AuditEventRepository;
import org.springframework.context.annotation.Primary;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.util.CollectionUtils;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.model.security.PersistentAuditEvent;
import stirling.software.proprietary.repository.PersistentAuditEventRepository;
import stirling.software.proprietary.util.SecretMasker;

import tools.jackson.databind.ObjectMapper;

@Component
@Primary
@RequiredArgsConstructor
@Slf4j
public class CustomAuditEventRepository implements AuditEventRepository {

    private final PersistentAuditEventRepository repo;
    private final ObjectMapper mapper;

    /* ── READ side intentionally inert (endpoint disabled) ── */
    @Override
    public List<AuditEvent> find(String p, Instant after, String type) {
        return List.of();
    }

    /* ── WRITE side (async) ───────────────────────────────── */
    @Async("auditExecutor")
    @Override
    public void add(AuditEvent ev) {
        try {
            Map<String, Object> clean =
                    CollectionUtils.isEmpty(ev.getData())
                            ? Map.of()
                            : SecretMasker.mask(ev.getData());

            if (clean.isEmpty() || (clean.size() == 1 && clean.containsKey("details"))) {
                return;
            }
            String rid = MDC.get("requestId");

            if (rid != null) {
                clean = new java.util.HashMap<>(clean);
                clean.put("requestId", rid);
            }

            String auditEventData = mapper.writeValueAsString(clean);
            log.debug("AuditEvent data (JSON): {}", auditEventData);

            PersistentAuditEvent ent =
                    PersistentAuditEvent.builder()
                            .principal(safePrincipal(ev.getPrincipal()))
                            .type(ev.getType())
                            .data(auditEventData)
                            .timestamp(ev.getTimestamp())
                            .build();
            repo.save(ent);
        } catch (Exception e) {
            log.error("Failed to persist audit event (fail-open); type={}", ev.getType(), e);
        }
    }

    /** Width of the {@code principal} column; longer values are hashed so the insert can't fail. */
    private static final int PRINCIPAL_MAX_LENGTH = 255;

    /**
     * Keep the principal within the column width and never store a token-shaped value verbatim;
     * hash those so distinct callers stay distinguishable in the audit trail without persisting a
     * secret.
     */
    static String safePrincipal(String principal) {
        if (principal == null || principal.isBlank()) {
            return "anonymous";
        }
        // A JWT ("eyJ..."), or any over-long value, is hashed rather than stored as-is.
        if (principal.startsWith("eyJ") || principal.length() > PRINCIPAL_MAX_LENGTH) {
            return "token:" + sha256Prefix(principal);
        }
        return principal;
    }

    /**
     * First 8 bytes of the SHA-256 digest as hex: stable per value, one-way, collision-safe enough.
     */
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
}
