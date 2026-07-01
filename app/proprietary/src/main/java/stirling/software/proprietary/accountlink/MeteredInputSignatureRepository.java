package stirling.software.proprietary.accountlink;

import org.springframework.data.jpa.repository.JpaRepository;

/** Persistence for the per-period metered input-set signatures (combined-billing "Mode A"). */
public interface MeteredInputSignatureRepository
        extends JpaRepository<MeteredInputSignature, Long> {}
