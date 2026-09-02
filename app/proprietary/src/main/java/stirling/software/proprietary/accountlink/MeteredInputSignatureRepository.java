package stirling.software.proprietary.accountlink;

import java.time.LocalDateTime;
import java.util.Optional;

import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;

/** Persistence for the per-period metered input-set signatures (combined-billing "Mode A"). */
@ApplicationScoped
public class MeteredInputSignatureRepository
        implements PanacheRepositoryBase<MeteredInputSignature, Long> {

    /** The existing row for a seen input set, so the meter can apply the workflow-window check. */
    public Optional<MeteredInputSignature> findByPeriodStartAndSignature(
            LocalDateTime periodStart, String signature) {
        return find("periodStart = ?1 and signature = ?2", periodStart, signature)
                .firstResultOptional();
    }

    /** Spring Data's {@code save}: the generated id decides insert, a detached row merges. */
    @Transactional
    public MeteredInputSignature save(MeteredInputSignature signature) {
        if (signature.getId() == null || getEntityManager().contains(signature)) {
            persist(signature);
            return signature;
        }
        return getEntityManager().merge(signature);
    }

    /**
     * Spring Data's {@code saveAndFlush}: flushes here so a lost first-sighting claim surfaces as a
     * unique-constraint {@code PersistenceException} the meter can treat as chaining.
     */
    @Transactional
    public MeteredInputSignature saveAndFlush(MeteredInputSignature signature) {
        persistAndFlush(signature);
        return signature;
    }
}
