package stirling.software.proprietary.policy.ledger;

import java.util.Collection;
import java.util.HashMap;
import java.util.Map;
import java.util.function.Supplier;

/**
 * In-memory {@link ProcessedLedger} for tests and DB-less wiring; mirrors {@code
 * JpaProcessedLedger}'s claim/settle/cleanup semantics exactly (the shared contract test holds both
 * to them). Coarse synchronization: correctness over throughput.
 */
public class InProcessProcessedLedger implements ProcessedLedger {

    private final Map<String, Map<String, Row>> rowsByPolicy = new HashMap<>();
    private final Supplier<Long> nowMillis;

    public InProcessProcessedLedger() {
        this(System::currentTimeMillis);
    }

    public InProcessProcessedLedger(Supplier<Long> nowMillis) {
        this.nowMillis = nowMillis;
    }

    @Override
    public synchronized boolean claim(String policyId, String identity, String signature) {
        Map<String, Row> rows = rowsByPolicy.computeIfAbsent(policyId, key -> new HashMap<>());
        long now = nowMillis.get();
        Row row = rows.get(identity);
        if (row == null) {
            rows.put(identity, new Row(signature, ProcessedFileStatus.PROCESSING, 1, now));
            return true;
        }
        if (row.status == ProcessedFileStatus.PROCESSING) {
            return false;
        }
        if (!signature.equals(row.signature)) {
            row.signature = signature;
            row.status = ProcessedFileStatus.PROCESSING;
            row.attempts = 1;
            row.lastSeen = now;
            return true;
        }
        if (row.status == ProcessedFileStatus.INTERRUPTED && row.attempts < MAX_ATTEMPTS) {
            row.status = ProcessedFileStatus.PROCESSING;
            row.attempts++;
            row.lastSeen = now;
            return true;
        }
        return false;
    }

    @Override
    public synchronized void settle(
            String policyId, String identity, String finalSignature, boolean success) {
        upsertSettled(
                policyId,
                identity,
                finalSignature,
                success ? ProcessedFileStatus.DONE : ProcessedFileStatus.ERROR);
    }

    @Override
    public synchronized void recordOutput(String policyId, String identity, String signature) {
        upsertSettled(policyId, identity, signature, ProcessedFileStatus.DONE);
    }

    private void upsertSettled(
            String policyId, String identity, String signature, ProcessedFileStatus status) {
        Map<String, Row> rows = rowsByPolicy.computeIfAbsent(policyId, key -> new HashMap<>());
        long now = nowMillis.get();
        Row row = rows.get(identity);
        if (row == null) {
            rows.put(identity, new Row(signature, status, 1, now));
            return;
        }
        row.signature = signature;
        row.status = status;
        row.lastSeen = now;
    }

    @Override
    public synchronized void markSeen(String policyId, Collection<String> identities) {
        Map<String, Row> rows = rowsByPolicy.get(policyId);
        if (rows == null) {
            return;
        }
        long now = nowMillis.get();
        for (String identity : identities) {
            Row row = rows.get(identity);
            if (row != null) {
                row.lastSeen = now;
            }
        }
    }

    @Override
    public synchronized int deleteUnseen(String policyId, long seenSinceMillis) {
        Map<String, Row> rows = rowsByPolicy.get(policyId);
        if (rows == null) {
            return 0;
        }
        int before = rows.size();
        rows.values()
                .removeIf(
                        row ->
                                row.lastSeen < seenSinceMillis
                                        && row.status != ProcessedFileStatus.PROCESSING);
        return before - rows.size();
    }

    @Override
    public synchronized void clearPolicy(String policyId) {
        rowsByPolicy.remove(policyId);
    }

    @Override
    public synchronized void recoverInterrupted() {
        for (Map<String, Row> rows : rowsByPolicy.values()) {
            for (Row row : rows.values()) {
                if (row.status == ProcessedFileStatus.PROCESSING) {
                    row.status = ProcessedFileStatus.INTERRUPTED;
                }
            }
        }
    }

    private static final class Row {
        private String signature;
        private ProcessedFileStatus status;
        private int attempts;
        private long lastSeen;

        private Row(String signature, ProcessedFileStatus status, int attempts, long lastSeen) {
            this.signature = signature;
            this.status = status;
            this.attempts = attempts;
            this.lastSeen = lastSeen;
        }
    }
}
