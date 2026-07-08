package stirling.software.proprietary.policy.ledger;

import java.util.function.Supplier;

import org.junit.jupiter.api.AfterEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.AutoConfigurationPackage;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;

/**
 * {@link JpaProcessedLedger} against the shared {@link ProcessedLedger} contract on a real (H2)
 * database, so the conditional-update claim CAS, the flushed-insert race idiom, and the guarded
 * presence-cleanup delete actually run as SQL rather than being asserted against a mock.
 *
 * <p>The inherited contract tests run OUTSIDE {@code @DataJpaTest}'s per-test transaction (the
 * transaction attribute is resolved against the method's declaring class, which is the plain
 * contract base), so every ledger call commits in its own transaction - exactly how the runtime
 * bean executes in production, where no enclosing transaction exists either. State is therefore
 * wiped explicitly between tests instead of relying on rollback.
 */
@DataJpaTest
class JpaProcessedLedgerDbTest extends ProcessedLedgerContractTest {

    @Autowired private ProcessedFileRepository repository;

    @AfterEach
    void wipeLedger() {
        // Bulk form deliberately: deleteAll() walks entities and skips any whose isNew() is true,
        // which this entity hardcodes for the insert-race idiom - making deleteAll() a no-op.
        repository.deleteAllInBatch();
    }

    @Override
    ProcessedLedger newLedger(Supplier<Long> nowMillis) {
        return new JpaProcessedLedger(repository, nowMillis);
    }

    @SpringBootConfiguration
    @AutoConfigurationPackage
    static class TestApp {}
}
