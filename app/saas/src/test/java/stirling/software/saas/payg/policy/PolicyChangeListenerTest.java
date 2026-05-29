package stirling.software.saas.payg.policy;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;

/**
 * Smoke tests for {@link PolicyChangeListener}. Full reconnect / NOTIFY-translation coverage needs
 * a real Postgres (Testcontainers) and lands with the integration-test sweep; here we only assert
 * the construction + null-jdbc + idempotent-stop invariants — the corners most likely to bite in a
 * misconfigured staging deploy.
 */
class PolicyChangeListenerTest {

    @Test
    void nullJdbcUrl_skipsStartButDoesNotThrow() {
        ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
        PolicyChangeListener listener = new PolicyChangeListener(null, "user", "", events);

        assertThatCode(listener::start).doesNotThrowAnyException();
        // No event published; listener decided not to start.
        verifyNoInteractions(events);
    }

    @Test
    void blankJdbcUrl_skipsStartButDoesNotThrow() {
        ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
        PolicyChangeListener listener = new PolicyChangeListener("   ", "user", "", events);

        assertThatCode(listener::start).doesNotThrowAnyException();
        verifyNoInteractions(events);
    }

    @Test
    void stop_isSafeWhenStartWasSkipped() {
        // Container shutdown may call @PreDestroy even on beans whose @PostConstruct early-exited.
        // The listener must tolerate this — null executor, null connection.
        ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
        PolicyChangeListener listener = new PolicyChangeListener(null, "user", "", events);

        listener.start(); // no-op
        assertThatCode(listener::stop).doesNotThrowAnyException();
    }

    @Test
    void stop_isIdempotent() {
        ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
        PolicyChangeListener listener = new PolicyChangeListener(null, "user", "", events);

        listener.start();
        listener.stop();
        assertThatCode(listener::stop).doesNotThrowAnyException();
    }

    @Test
    void channelConstantMatchesNotifyMigration() {
        // Locks the channel name with what the Supabase trigger function writes
        // (pg_notify('policy_changed', ...)). If anyone renames either side, this test fires
        // first instead of staging silently going deaf.
        assertThat(PolicyChangeListener.CHANNEL).isEqualTo("policy_changed");
    }
}
