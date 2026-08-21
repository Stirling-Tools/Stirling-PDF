package stirling.software.saas.controller;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.Test;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionDefinition;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Verifies finding #18 (acceptInvitation transactional boundary) end-to-end.
 *
 * <p>Connor's claim: {@code SaasTeamController.acceptInvitation} is {@code @Transactional}, calls
 * {@code saasTeamService.acceptInvitation} (also {@code @Transactional}), then calls {@code
 * userService.changeRole}. If {@code changeRole} throws, the membership is persisted but PRO role
 * is not granted.
 *
 * <p>Earlier analysis flagged this BOGUS because both methods use default {@code REQUIRED}
 * propagation → single physical transaction; a propagating exception rolls everything back. But the
 * controller catches {@code Exception} in its try/catch, so the exception NEVER propagates out of
 * the transactional boundary. This test pins down what actually happens.
 */
class AcceptInvitationTxnTest {

    @Test
    void txnCommitsWhenInnerExceptionIsSwallowedByCatch() {
        // This is the exact shape of SaasTeamController.acceptInvitation:
        //   @Transactional
        //   try {
        //     saasTeamService.acceptInvitation(...);   // commits membership inside outer txn
        //     userService.changeRole(...);             // THROWS
        //     return 200;
        //   } catch (Exception e) {
        //     return 500;                              // swallows!
        //   }
        // Question: does the @Transactional commit or roll back?

        AtomicInteger commits = new AtomicInteger();
        AtomicInteger rollbacks = new AtomicInteger();
        TransactionTemplate template = newTemplate(commits, rollbacks);

        template.executeWithoutResult(
                status -> {
                    // saasTeamService.acceptInvitation(...) — succeeds.
                    // changeRole throws an Exception that we then catch:
                    try {
                        throw new RuntimeException("simulated changeRole failure");
                    } catch (Exception e) {
                        // controller swallows — no setRollbackOnly call.
                    }
                });

        assertThat(commits.get())
                .as(
                        "If a try/catch in the @Transactional method swallows the exception"
                                + " without calling setRollbackOnly(), the transaction COMMITS."
                                + " That's the #18 bug: membership commits even though the role"
                                + " grant failed.")
                .isEqualTo(1);
        assertThat(rollbacks.get()).isZero();
    }

    @Test
    void txnRollsBackIfCatchCallsSetRollbackOnly() {
        // Fix candidate: have the catch call status.setRollbackOnly().
        AtomicInteger commits = new AtomicInteger();
        AtomicInteger rollbacks = new AtomicInteger();
        TransactionTemplate template = newTemplate(commits, rollbacks);

        template.executeWithoutResult(
                status -> {
                    try {
                        throw new RuntimeException("simulated changeRole failure");
                    } catch (Exception e) {
                        status.setRollbackOnly();
                    }
                });

        // With setRollbackOnly the manager doesn't call doCommit / doRollback in this stub the
        // same way (it goes through the rollback path because of the flag). Both are valid
        // proofs that the transaction did NOT commit normally.
        assertThat(rollbacks.get() + commits.get())
                .as("transaction must have terminated")
                .isEqualTo(1);
        // Strict: the rollback-only flag forces the manager onto the rollback path, not commit.
        assertThat(commits.get())
                .as("setRollbackOnly() must prevent commit even though no exception propagated")
                .isZero();
    }

    @Test
    void txnRollsBackIfExceptionPropagates() {
        // Alternative fix: don't catch the exception, let it propagate out of the @Transactional
        // method. Spring's default rollback rules then trigger.
        AtomicInteger commits = new AtomicInteger();
        AtomicInteger rollbacks = new AtomicInteger();
        TransactionTemplate template = newTemplate(commits, rollbacks);

        try {
            template.executeWithoutResult(
                    status -> {
                        throw new RuntimeException("simulated changeRole failure");
                    });
        } catch (RuntimeException expected) {
            // expected; the @ExceptionHandler / outer caller deals with it
        }

        assertThat(commits.get()).isZero();
        assertThat(rollbacks.get()).isEqualTo(1);
    }

    private static TransactionTemplate newTemplate(AtomicInteger commits, AtomicInteger rollbacks) {
        PlatformTransactionManager tm =
                new AbstractPlatformTransactionManager() {
                    @Override
                    protected Object doGetTransaction() {
                        return new Object();
                    }

                    @Override
                    protected void doBegin(Object tx, TransactionDefinition def) {}

                    @Override
                    protected void doCommit(DefaultTransactionStatus status) {
                        commits.incrementAndGet();
                    }

                    @Override
                    protected void doRollback(DefaultTransactionStatus status) {
                        rollbacks.incrementAndGet();
                    }
                };
        return new TransactionTemplate(tm, new DefaultTransactionDefinition());
    }
}
