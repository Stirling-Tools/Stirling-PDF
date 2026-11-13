package stirling.software.proprietary.serverregistration;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;

import jakarta.persistence.LockModeType;

/**
 * Local state only; this repository never accesses cloud registration or Team entitlement tables.
 */
public interface ServerRegistrationStateRepository
        extends JpaRepository<ServerRegistrationState, Long> {
    /** Serializes reservations and acknowledgements across reporters sharing the database. */
    @Override
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    java.util.Optional<ServerRegistrationState> findById(Long id);
}
