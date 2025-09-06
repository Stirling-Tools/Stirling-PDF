package stirling.software.proprietary.config;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.slf4j.MDC;
import org.springframework.boot.actuate.audit.AuditEvent;
import org.springframework.boot.actuate.audit.AuditEventRepository;
import org.springframework.context.annotation.Primary;
import org.springframework.scheduling.annotation.Async;
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
            String rid = MDC.get("requestId");

            if (rid != null) {
                clean = new java.util.HashMap<>(clean);
                clean.put("requestId", rid);
            }

            String auditEventData = mapper.writeValueAsString(clean);
            log.debug("AuditEvent data (JSON): {}", auditEventData);

            PersistentAuditEvent ent =
                    PersistentAuditEvent.builder()
                            .principal(ev.getPrincipal())
                            .type(ev.getType())
                            .data(auditEventData)
                            .timestamp(ev.getTimestamp())
                            .build();
            repo.save(ent);
        } catch (Exception e) {
            e.printStackTrace(); // fail-open
        }
    }
}
