package stirling.software.saas.payg.repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;

import jakarta.enterprise.context.ApplicationScoped;

import stirling.software.saas.payg.shadow.PaygShadowCharge;

@ApplicationScoped
public class PaygShadowChargeRepository implements PanacheRepositoryBase<PaygShadowCharge, Long> {

    public List<PaygShadowCharge> findInWindow(LocalDateTime from, LocalDateTime to) {
        return find("occurredAt >= ?1 AND occurredAt < ?2 ORDER BY occurredAt DESC", from, to)
                .list();
    }

    /**
     * The shadow row written when the given process was opened. At most one row per jobId exists.
     */
    public Optional<PaygShadowCharge> findFirstByJobIdOrderByIdAsc(UUID jobId) {
        return find("jobId = ?1 ORDER BY id ASC", jobId).firstResultOptional();
    }
}
