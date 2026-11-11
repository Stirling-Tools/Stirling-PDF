package stirling.software.proprietary.accountlink;

import org.springframework.data.jpa.repository.JpaRepository;

/** Data access for the singleton {@link ConnectState} row. */
public interface ConnectStateRepository extends JpaRepository<ConnectState, Long> {}
