package stirling.software.proprietary.config;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.slf4j.MDC;

import jakarta.enterprise.context.ApplicationScoped;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.model.security.PersistentAuditEvent;
import stirling.software.proprietary.repository.PersistentAuditEventRepository;
import stirling.software.proprietary.util.SecretMasker;

// TODO: Migration required - this class implemented Spring Boot Actuator's
// org.springframework.boot.actuate.audit.AuditEventRepository (with @Primary). Quarkus has no
// Actuator equivalent, so the interface and the org.springframework.boot.actuate.audit.AuditEvent
// type are gone. The write side has been ported to a plain CDI bean that accepts the audit data
// directly (see add(...) below). Whatever Spring code previously published AuditEvents to this
// repository must be updated to call this bean's add(...) method (or an equivalent producer) once
// the audit-publishing pipeline is migrated. The read-side find(...) was intentionally inert
// (endpoint disabled) and has been dropped.
@ApplicationScoped
@RequiredArgsConstructor
@Slf4j
public class CustomAuditEventRepository {

    // Jackson 3 ObjectMapper as a static field - Quarkus CDI only produces com.fasterxml (Jackson
    // 2)
    // beans; Jackson 3 is used as a plain library here for JSON serialization of audit data.
    private static final tools.jackson.databind.ObjectMapper MAPPER =
            new tools.jackson.databind.ObjectMapper();

    private final PersistentAuditEventRepository repo;

    /* ── WRITE side ───────────────────────────────────────── */
    // TODO: Migration required - was @Async("auditExecutor") (Spring async executor). Quarkus has
    // no @Async; run this off the request thread via a managed executor (e.g. inject
    // org.eclipse.microprofile.context.ManagedExecutor and submit, or annotate with
    // @io.smallrye.common.annotation.Blocking on a reactive path). Logic is kept synchronous for
    // now to avoid changing behavior incorrectly.
    public void add(String principal, String type, Instant timestamp, Map<String, Object> data) {
        try {
            Map<String, Object> clean =
                    (data == null || data.isEmpty()) ? Map.of() : SecretMasker.mask(data);

            if (clean.isEmpty() || (clean.size() == 1 && clean.containsKey("details"))) {
                return;
            }
            String rid = MDC.get("requestId");

            if (rid != null) {
                clean = new java.util.HashMap<>(clean);
                clean.put("requestId", rid);
            }

            String auditEventData = MAPPER.writeValueAsString(clean);
            log.debug("AuditEvent data (JSON): {}", auditEventData);

            PersistentAuditEvent ent =
                    PersistentAuditEvent.builder()
                            .principal(principal)
                            .type(type)
                            .data(auditEventData)
                            .timestamp(timestamp)
                            .build();
            // TODO: Migration required - repo.save(...) depends on PersistentAuditEventRepository
            // being migrated to a Quarkus PanacheRepository (save -> persist). Update this call
            // once that collaborator is converted.
            repo.persist(ent);
        } catch (Exception e) {
            log.error("Failed to persist audit event (fail-open); principal={}", principal, e);
        }
    }

    /* ── READ side intentionally inert (endpoint disabled) ──
     * Original find(String, Instant, String) returned List.of(); the Actuator read endpoint was
     * disabled. Re-add a typed read method here if an audit-query endpoint is reintroduced. */
    public List<PersistentAuditEvent> find() {
        return List.of();
    }
}
