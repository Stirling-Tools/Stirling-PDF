package stirling.software.proprietary.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.slf4j.MDC;
import org.springframework.boot.actuate.audit.AuditEvent;
import org.springframework.boot.actuate.audit.AuditEventRepository;
import org.springframework.context.annotation.Primary;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.util.CollectionUtils;
import stirling.software.proprietary.model.security.PersistentAuditEvent;
import stirling.software.proprietary.repository.PersistentAuditEventRepository;
import stirling.software.proprietary.util.SecretMasker;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@Component
@Primary
@RequiredArgsConstructor
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

            String rid = MDC.get("requestId");
            if (rid != null) {
                clean = new java.util.HashMap<>(clean);
                clean.put("requestId", rid);
            }

            PersistentAuditEvent ent = PersistentAuditEvent.builder()
                    .principal(ev.getPrincipal())
                    .type(ev.getType())
                    .data(mapper.writeValueAsString(clean))
                    .timestamp(ev.getTimestamp())
                    .build();
            repo.save(ent);
        } catch (Exception e) {
            e.printStackTrace();    // fail-open
        }
    }
}