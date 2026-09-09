package stirling.software.proprietary.policy.ledger;

import java.util.Collection;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;
import java.util.function.Supplier;

/**
 * In-memory {@link ProcessedLedger} for tests and DB-less wiring; kept semantically identical to
 * {@code JpaProcessedLedger} by the shared contract test.
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
    public synchronized Map<String, ClaimState> statesFor(
            String policyId, Collection<String> identities) {
        Map<String, Row> rows = rowsByPolicy.getOrDefault(policyId, Map.of());
        Map<String, ClaimState> states = new HashMap<>();
        for (String identity : identities) {
            Row row = rows.get(identity);
            if (row != null) {
                states.put(identity, new ClaimState(row.status, row.gate, row.contentHash));
            }
        }
        return states;
    }

    // Single-lock store: the live row is never staler than any observed snapshot, so decide
    // against it directly; the conditional updates of the JPA ledger yield the same outcomes.
    @Override
    public synchronized boolean claim(
            String policyId,
            String identity,
            String gate,
            Supplier<String> contentHash,
            ClaimState observed) {
        Map<String, Row> rows = rowsByPolicy.computeIfAbsent(policyId, key -> new HashMap<>());
        long now = nowMillis.get();
        Row row = rows.get(identity);
        if (row == null) {
            String hash = contentHash == null ? null : contentHash.get();
            rows.put(identity, new Row(gate, hash, ProcessedFileStatus.PROCESSING, 1, now));
            return true;
        }
        if (row.status == ProcessedFileStatus.PROCESSING) {
            return false;
        }
        if (gate.equals(row.gate)) {
            if (row.status == ProcessedFileStatus.INTERRUPTED && row.attempts < MAX_ATTEMPTS) {
                row.status = ProcessedFileStatus.PROCESSING;
                row.attempts++;
                row.lastSeen = now;
                return true;
            }
            return false;
        }
        if (contentHash == null) {
            row.gate = gate;
            row.contentHash = null;
            row.status = ProcessedFileStatus.PROCESSING;
            row.attempts = 1;
            row.lastSeen = now;
            return true;
        }
        String hash = contentHash.get();
        if (Objects.equals(hash, row.contentHash)) {
            if (row.status == ProcessedFileStatus.INTERRUPTED && row.attempts < MAX_ATTEMPTS) {
                row.gate = gate;
                row.status = ProcessedFileStatus.PROCESSING;
                row.attempts++;
                row.lastSeen = now;
                return true;
            }
            if (row.status != ProcessedFileStatus.INTERRUPTED) {
                row.gate = gate;
                row.lastSeen = now;
            }
            return false;
        }
        row.gate = gate;
        row.contentHash = hash;
        row.status = ProcessedFileStatus.PROCESSING;
        row.attempts = 1;
        row.lastSeen = now;
        return true;
    }

    @Override
    public synchronized void settle(
            String policyId,
            String identity,
            String finalGate,
            String finalContentHash,
            boolean success) {
        upsertSettled(
                policyId,
                identity,
                finalGate,
                finalContentHash,
                success ? ProcessedFileStatus.DONE : ProcessedFileStatus.ERROR);
    }

    @Override
    public synchronized void recordOutput(
            String policyId, String identity, String gate, String contentHash) {
        upsertSettled(policyId, identity, gate, contentHash, ProcessedFileStatus.DONE);
    }

    @Override
    public synchronized void forgetOutput(String policyId, String identity, String gate) {
        Map<String, Row> rows = rowsByPolicy.get(policyId);
        if (rows == null) {
            return;
        }
        Row row = rows.get(identity);
        if (row != null && row.status == ProcessedFileStatus.DONE && gate.equals(row.gate)) {
            rows.remove(identity);
        }
    }

    private void upsertSettled(
            String policyId,
            String identity,
            String gate,
            String contentHash,
            ProcessedFileStatus status) {
        Map<String, Row> rows = rowsByPolicy.computeIfAbsent(policyId, key -> new HashMap<>());
        long now = nowMillis.get();
        Row row = rows.get(identity);
        if (row == null) {
            rows.put(identity, new Row(gate, contentHash, status, 1, now));
            return;
        }
        row.gate = gate;
        row.contentHash = contentHash;
        row.status = status;
        row.lastSeen = now;
    }

    @Override
    public synchronized boolean allSettledDone(String identity) {
        for (Map<String, Row> rows : rowsByPolicy.values()) {
            Row row = rows.get(identity);
            if (row != null && row.status != ProcessedFileStatus.DONE) {
                return false;
            }
        }
        return true;
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
        private String gate;
        private String contentHash;
        private ProcessedFileStatus status;
        private int attempts;
        private long lastSeen;

        private Row(
                String gate,
                String contentHash,
                ProcessedFileStatus status,
                int attempts,
                long lastSeen) {
            this.gate = gate;
            this.contentHash = contentHash;
            this.status = status;
            this.attempts = attempts;
            this.lastSeen = lastSeen;
        }
    }
}
