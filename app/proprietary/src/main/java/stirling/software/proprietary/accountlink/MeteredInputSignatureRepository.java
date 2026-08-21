package stirling.software.proprietary.accountlink;

import java.time.LocalDateTime;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

/** Persistence for the per-period metered input-set signatures (combined-billing "Mode A"). */
public interface MeteredInputSignatureRepository
        extends JpaRepository<MeteredInputSignature, Long> {

    /** The existing row for a seen input set, so the meter can apply the workflow-window check. */
    Optional<MeteredInputSignature> findByPeriodStartAndSignature(
            LocalDateTime periodStart, String signature);
}
