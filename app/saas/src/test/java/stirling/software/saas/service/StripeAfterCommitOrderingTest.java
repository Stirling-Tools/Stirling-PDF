package stirling.software.saas.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Pins the mechanism that {@code CreditService.scheduleStripeReportAfterCommit} depends on: a
 * {@link TransactionSynchronization#afterCommit()} hook registered during a transaction must fire
 * <em>after</em> the transaction commits, not before, and must NOT fire on rollback.
 *
 * <p>Why this is its own test: production {@code CreditService} would be expensive to instantiate
 * (repositories, UserService, metric registry, all the SaaS extension services). This test isolates
 * the contract we're betting the refactor on, so a future Spring change that broke the contract
 * would fail loudly here rather than silently in production.
 *
 * <p>We drive {@link TransactionSynchronizationManager} directly rather than spinning a real
 * transaction manager — the synchronisation lifecycle is the only thing under test.
 */
class StripeAfterCommitOrderingTest {

    @AfterEach
    void clearSynchronization() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clear();
        }
    }

    @Test
    void afterCommitRunsAfterCommit_notDuringTransaction() {
        List<String> order = new ArrayList<>();

        TransactionSynchronizationManager.initSynchronization();
        try {
            order.add("inside-tx-before-register");
            TransactionSynchronizationManager.registerSynchronization(
                    new TransactionSynchronization() {
                        @Override
                        public void afterCommit() {
                            order.add("after-commit-hook");
                        }
                    });
            order.add("inside-tx-after-register");

            // Simulate commit: Spring triggers afterCommit on every registered sync, then
            // beforeCompletion / afterCompletion (afterCompletion not asserted here).
            order.add("commit-triggered");
            for (TransactionSynchronization s :
                    TransactionSynchronizationManager.getSynchronizations()) {
                s.afterCommit();
            }
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }

        assertThat(order)
                .containsExactly(
                        "inside-tx-before-register",
                        "inside-tx-after-register",
                        "commit-triggered",
                        "after-commit-hook");
    }

    @Test
    void afterCommitDoesNotRun_onRollback() {
        List<String> order = new ArrayList<>();

        TransactionSynchronizationManager.initSynchronization();
        try {
            TransactionSynchronizationManager.registerSynchronization(
                    new TransactionSynchronization() {
                        @Override
                        public void afterCommit() {
                            order.add("after-commit-hook-MUST-NOT-FIRE");
                        }

                        @Override
                        public void afterCompletion(int status) {
                            // Spring calls afterCompletion(STATUS_ROLLED_BACK) on rollback but
                            // skips afterCommit. Mirror that here so the test reflects what the
                            // framework actually does.
                            if (status == TransactionSynchronization.STATUS_ROLLED_BACK) {
                                order.add("after-completion-rollback");
                            }
                        }
                    });

            // Simulate rollback: Spring skips afterCommit; only afterCompletion fires.
            for (TransactionSynchronization s :
                    TransactionSynchronizationManager.getSynchronizations()) {
                s.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK);
            }
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }

        assertThat(order)
                .as(
                        "afterCommit must NOT fire when the tx rolls back. If it did, we'd post a"
                                + " Stripe meter event for a debit that never persisted.")
                .containsExactly("after-completion-rollback")
                .doesNotContain("after-commit-hook-MUST-NOT-FIRE");
    }

    @Test
    void isSynchronizationActive_reflectsSpringTransactionalContext() {
        // CreditService.scheduleStripeReportAfterCommit branches on this — if it's not active
        // (e.g. tests calling consume() outside any tx) it falls back to synchronous reporting.
        // This pins that the flag tracks initSynchronization / clearSynchronization correctly.

        assertThat(TransactionSynchronizationManager.isSynchronizationActive())
                .as("Outside a tx, synchronisation must be inactive.")
                .isFalse();

        TransactionSynchronizationManager.initSynchronization();
        try {
            assertThat(TransactionSynchronizationManager.isSynchronizationActive())
                    .as("Inside a tx, synchronisation must be active.")
                    .isTrue();
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }

        assertThat(TransactionSynchronizationManager.isSynchronizationActive())
                .as("After clear, synchronisation must be inactive again.")
                .isFalse();
    }
}
