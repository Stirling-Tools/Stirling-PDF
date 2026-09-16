package stirling.software.saas.usage;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;

import stirling.software.proprietary.security.model.User;

/**
 * Lifetime quota for server tool requests, serialized across replicas by locking the user row.
 * Multipart batches consume one slot; tools issuing one request per file consume one per file. A
 * slot is reserved before execution and returned on an HTTP failure. Accepted background jobs
 * retain their slot. Reservations survive a process crash conservatively, preventing restarts from
 * replenishing the guest allowance.
 */
@Service
@Profile("saas")
public class GuestToolUsageService {
    private final EntityManager entityManager;
    private final int limit;

    public GuestToolUsageService(
            EntityManager entityManager, @Value("${app.auth.anonymous.tool-limit:5}") int limit) {
        if (limit < 0) throw new IllegalArgumentException("Guest tool limit must not be negative");
        this.entityManager = entityManager;
        this.limit = limit;
    }

    /** Reserves one server tool execution. Failed requests must release their reservation once. */
    @Transactional
    public boolean reserve(Long userId) {
        if (entityManager.find(User.class, userId, LockModeType.PESSIMISTIC_WRITE) == null) {
            return false;
        }
        GuestToolUsage usage = entityManager.find(GuestToolUsage.class, userId);
        if (usage == null) {
            usage = new GuestToolUsage(userId);
            entityManager.persist(usage);
        }
        if (usage.getUsed() >= limit) return false;
        usage.setUsed(usage.getUsed() + 1);
        return true;
    }

    /** Returns a failed request's slot; successful requests retain it for the guest's lifetime. */
    @Transactional
    public void release(Long userId) {
        if (entityManager.find(User.class, userId, LockModeType.PESSIMISTIC_WRITE) == null) return;
        GuestToolUsage usage = entityManager.find(GuestToolUsage.class, userId);
        if (usage != null && usage.getUsed() > 0) usage.setUsed(usage.getUsed() - 1);
    }

    /** The same ceiling is included in signup responses so the UI does not duplicate policy. */
    public int limit() {
        return limit;
    }
}
