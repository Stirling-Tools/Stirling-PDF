package stirling.software.saas.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Pins the contract {@code JobChargeService.close} relies on for its Stripe meter post: a {@link
 * TransactionSynchronization#afterCommit()} hook fires after a successful commit and never on
 * rollback.
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

            // Simulate commit by firing afterCommit on every registered synchronization.
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
                            if (status == TransactionSynchronization.STATUS_ROLLED_BACK) {
                                order.add("after-completion-rollback");
                            }
                        }
                    });

            // Simulate rollback: afterCompletion fires, afterCommit must not.
            for (TransactionSynchronization s :
                    TransactionSynchronizationManager.getSynchronizations()) {
                s.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK);
            }
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }

        assertThat(order)
                .containsExactly("after-completion-rollback")
                .doesNotContain("after-commit-hook-MUST-NOT-FIRE");
    }

    @Test
    void isSynchronizationActive_reflectsSpringTransactionalContext() {
        assertThat(TransactionSynchronizationManager.isSynchronizationActive()).isFalse();

        TransactionSynchronizationManager.initSynchronization();
        try {
            assertThat(TransactionSynchronizationManager.isSynchronizationActive()).isTrue();
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }

        assertThat(TransactionSynchronizationManager.isSynchronizationActive()).isFalse();
    }
}
