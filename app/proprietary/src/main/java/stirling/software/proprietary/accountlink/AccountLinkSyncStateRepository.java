package stirling.software.proprietary.accountlink;

import org.springframework.data.jpa.repository.JpaRepository;

/** Persistence for the singleton {@link AccountLinkSyncState} (combined billing). */
public interface AccountLinkSyncStateRepository extends JpaRepository<AccountLinkSyncState, Long> {}
