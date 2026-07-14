package stirling.software.saas.payg.bundle;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/**
 * Persistence for {@link PrepaidBundleQuote} purchase tickets. Java only ever writes here (on
 * quote); the create-payg-bundle-checkout edge fn reads the ticket directly via the service-role
 * client, so no read methods are needed on this side.
 */
@Repository
public interface PrepaidBundleQuoteRepository extends JpaRepository<PrepaidBundleQuote, Long> {}
