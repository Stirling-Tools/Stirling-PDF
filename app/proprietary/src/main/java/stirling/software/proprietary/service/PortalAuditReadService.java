package stirling.software.proprietary.service;

import java.util.List;

import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.audit.PortalAuditEventRow;
import stirling.software.proprietary.model.security.PersistentAuditEvent;
import stirling.software.proprietary.repository.PersistentAuditEventRepository;

/**
 * Single cached read of recent {@code audit_events}, shared by every portal view derived from the
 * audit trail (Infrastructure -> Audit tab and the Documents page). One cache entry per scope
 * ({@code "server"} or {@code "team:<id>"}) with a short TTL, so the DB is scanned once per scope
 * no matter how many surfaces map it. Mapping to view DTOs stays in the per-surface services and is
 * cheap enough to run on every request (in-memory over a few hundred rows).
 */
@Service
@RequiredArgsConstructor
public class PortalAuditReadService {

    /** Cache name - registered with a short TTL in CacheConfig. */
    public static final String CACHE_NAME = "portalAuditEvents";

    /** Newest rows to scan; each surface filters this down to what it shows. */
    private static final int SCAN_LIMIT = 400;

    private final PersistentAuditEventRepository auditRepository;

    /** Recent whole-server events (admins). */
    @Cacheable(value = CACHE_NAME, key = "'server'")
    public List<PortalAuditEventRow> serverEvents() {
        return toRows(auditRepository.findAll(recentPage()).getContent());
    }

    /** Recent events by the given principals (team scope). Empty principals yield an empty list. */
    @Cacheable(value = CACHE_NAME, key = "#cacheKey")
    public List<PortalAuditEventRow> scopedEvents(String cacheKey, List<String> principals) {
        if (principals.isEmpty()) {
            return List.of();
        }
        return toRows(auditRepository.findByPrincipalIn(principals, recentPage()).getContent());
    }

    private static PageRequest recentPage() {
        return PageRequest.of(0, SCAN_LIMIT, Sort.by(Sort.Direction.DESC, "timestamp"));
    }

    private static List<PortalAuditEventRow> toRows(List<PersistentAuditEvent> events) {
        return events.stream()
                .map(
                        e ->
                                new PortalAuditEventRow(
                                        e.getId() == null ? 0L : e.getId(),
                                        e.getPrincipal(),
                                        e.getType(),
                                        e.getData(),
                                        e.getTimestamp()))
                .toList();
    }
}
