package stirling.software.proprietary.service;

import java.util.List;

import io.quarkus.cache.CacheKey;
import io.quarkus.cache.CacheResult;
import io.quarkus.panache.common.Page;

import jakarta.enterprise.context.ApplicationScoped;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.audit.AuditEventType;
import stirling.software.proprietary.audit.PortalAuditEventRow;
import stirling.software.proprietary.model.security.PersistentAuditEvent;
import stirling.software.proprietary.repository.PersistentAuditEventRepository;

/** One cached read of recent {@code audit_events} per scope, shared by all audit-derived views. */
@ApplicationScoped
@RequiredArgsConstructor
public class PortalAuditReadService {

    /** Cache name - given its short TTL by {@code quarkus.cache.caffeine."portalAuditEvents".*}. */
    public static final String CACHE_NAME = "portalAuditEvents";

    /** Newest rows to scan; each surface filters this down to what it shows. */
    private static final int SCAN_LIMIT = 400;

    /**
     * Read/polling noise excluded at the query level so the scan window stays full of meaningful
     * events. Otherwise a busy scope's recent rows fill with these and the visible list shrinks as
     * traffic grows - the "audit getting smaller over time" a user would see. No portal surface
     * shows these types anyway (the infra tab and documents feed both drop them).
     */
    private static final List<String> NOISE_TYPES =
            List.of(AuditEventType.UI_DATA.name(), AuditEventType.HTTP_REQUEST.name());

    private final PersistentAuditEventRepository auditRepository;

    /** Recent whole-server events (admins). */
    @CacheResult(cacheName = CACHE_NAME)
    public List<PortalAuditEventRow> serverEvents() {
        return toRows(auditRepository.findByTypeNotIn(NOISE_TYPES).page(recentPage()).list());
    }

    /** Recent events by the given principals (team scope). Empty principals yield an empty list. */
    @CacheResult(cacheName = CACHE_NAME)
    public List<PortalAuditEventRow> scopedEvents(
            @CacheKey String cacheKey, List<String> principals) {
        if (principals.isEmpty()) {
            return List.of();
        }
        return toRows(
                auditRepository
                        .findByTypeNotInAndPrincipalIn(NOISE_TYPES, principals)
                        .page(recentPage())
                        .list());
    }

    // The repository finders already sort newest-first, so this only bounds the scan window.
    private static Page recentPage() {
        return Page.of(0, SCAN_LIMIT);
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
