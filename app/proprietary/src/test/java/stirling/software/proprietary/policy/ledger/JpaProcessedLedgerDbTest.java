package stirling.software.proprietary.policy.ledger;

import java.util.function.Supplier;

import org.junit.jupiter.api.AfterEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.AutoConfigurationPackage;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;

/**
 * {@link JpaProcessedLedger} against the shared contract on a real (H2) database. The inherited
 * tests run outside {@code @DataJpaTest}'s per-test transaction (the transaction attribute resolves
 * against the declaring class, the plain contract base), so every ledger call commits in its own
 * transaction as at runtime; state is wiped explicitly instead of relying on rollback.
 */
@DataJpaTest
class JpaProcessedLedgerDbTest extends ProcessedLedgerContractTest {

    @Autowired private ProcessedFileRepository repository;

    @AfterEach
    void wipeLedger() {
        // deleteAll() skips entities whose isNew() is hardcoded true, so use the bulk form.
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
