package stirling.software.proprietary.serverregistration;

import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Local state only; this repository never accesses cloud registration or Team entitlement tables.
 */
public interface ServerRegistrationStateRepository
        extends JpaRepository<ServerRegistrationState, Long> {}
