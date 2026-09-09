package stirling.software.proprietary.policy.ledger;

import java.util.function.Supplier;

/** {@link InProcessProcessedLedger} against the shared {@link ProcessedLedger} contract. */
class InProcessProcessedLedgerTest extends ProcessedLedgerContractTest {

    @Override
    ProcessedLedger newLedger(Supplier<Long> nowMillis) {
        return new InProcessProcessedLedger(nowMillis);
    }
}
