package stirling.software.proprietary.config;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.slf4j.MDC;
import org.springframework.boot.actuate.audit.AuditEvent;
import org.springframework.boot.actuate.audit.AuditEventRepository;
import org.springframework.context.annotation.Primary;
import org.springframework.scheduling.annotation.Async;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.util.CollectionUtils;

import com.fasterxml.jackson.databind.ObjectMapper;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.model.security.PersistentAuditEvent;
import stirling.software.proprietary.repository.PersistentAuditEventRepository;
import stirling.software.proprietary.util.SecretMasker;

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

            // Extract origin and IP from the data map (set by AuditService before async call)
            String origin = "SYSTEM"; // default
            String ipAddress = null;

            if (clean.containsKey("__origin") || clean.containsKey("__ipAddress")) {
                clean = new java.util.HashMap<>(clean);

                if (clean.containsKey("__origin")) {
                    origin = String.valueOf(clean.remove("__origin"));
                }

                if (clean.containsKey("__ipAddress")) {
                    ipAddress = String.valueOf(clean.remove("__ipAddress"));
                }
            }

            String rid = MDC.get("requestId");

            if (rid != null) {
                clean = new java.util.HashMap<>(clean);
                clean.put("requestId", rid);
            }

            String auditEventData = mapper.writeValueAsString(clean);
            log.debug("AuditEvent data (JSON): {}", auditEventData);

            String principalName = extractPrincipalName(ev.getPrincipal());

            if (principalName.length() > 255) {
                log.warn(
                        "Principal length {} exceeds 255 characters, truncating: {}",
                        principalName.length(),
                        principalName.substring(0, Math.min(50, principalName.length())) + "...");
                principalName = principalName.substring(0, 255);
            }
            if (ev.getType().length() > 255) {
                log.warn(
                        "Type length {} exceeds 255 characters: {}",
                        ev.getType().length(),
                        ev.getType());
            }

            PersistentAuditEvent ent =
                    PersistentAuditEvent.builder()
                            .principal(principalName)
                            .type(ev.getType())
                            .data(auditEventData)
                            .timestamp(ev.getTimestamp())
                            .ipAddress(ipAddress)
                            .origin(origin)
                            .build();
            repo.save(ent);
        } catch (Exception e) {
            e.printStackTrace(); // fail-open
        }
    }

    /**
     * Extracts a meaningful principal name from the audit event principal. Uses lightweight
     * approach to avoid performance impact on high-volume audit events.
     */
    private String extractPrincipalName(String principal) {
        if (principal == null || principal.isEmpty()) {
            return "anonymous";
        }

        // Quick check for JWT tokens (they start with "eyJ")
        if (principal.startsWith("eyJ")) {
            Authentication auth = SecurityContextHolder.getContext().getAuthentication();
            if (auth != null && auth.isAuthenticated()) {
                String name = auth.getName();
                if (name != null && !name.startsWith("eyJ")) {
                    return name.length() > 255 ? name.substring(0, 255) : name;
                }
            }

            // Unverified/failed JWT; don't trust token content
            return "authentication-failure";
        }

        return principal.length() > 255 ? principal.substring(0, 255) : principal;
    }
}
