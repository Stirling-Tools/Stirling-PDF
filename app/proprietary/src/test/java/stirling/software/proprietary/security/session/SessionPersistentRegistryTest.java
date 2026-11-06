package stirling.software.proprietary.security.session;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.Test;
import org.springframework.security.core.userdetails.User;

import stirling.software.proprietary.security.database.repository.SessionRepository;
import stirling.software.proprietary.security.model.SessionEntity;

class SessionPersistentRegistryTest {

    private final SessionRepository sessionRepository = mock(SessionRepository.class);
    private final User principal = new User("user", "", List.of());

    @Test
    void successfulCallbackIsSignalledOnce() {
        AtomicInteger attempts = new AtomicInteger();
        SessionPersistentRegistry registry =
                new SessionPersistentRegistry(sessionRepository, attempts::incrementAndGet);

        registry.registerNewSession("s1", principal);
        registry.registerNewSession("s2", principal);

        assertEquals(1, attempts.get());
    }

    @Test
    void failedCallbackIsRetriedOnTheNextSession() {
        AtomicInteger attempts = new AtomicInteger();
        SessionPersistentRegistry registry =
                new SessionPersistentRegistry(
                        sessionRepository,
                        () -> {
                            attempts.incrementAndGet();
                            throw new IllegalStateException("scheduler unavailable");
                        });

        registry.registerNewSession("s1", principal);
        assertEquals(1, attempts.get());

        registry.registerNewSession("s2", principal);
        assertEquals(2, attempts.get(), "a failed first-use callback must be retried");
    }

    @Test
    void failedStartupArmIsRetriedWhenARestoredSessionRefreshes() {
        AtomicInteger attempts = new AtomicInteger();
        SessionPersistentRegistry registry =
                new SessionPersistentRegistry(
                        sessionRepository,
                        () -> {
                            if (attempts.incrementAndGet() == 1) {
                                throw new IllegalStateException("scheduler unavailable");
                            }
                        });
        when(sessionRepository.count()).thenReturn(1L);

        registry.armIfSessionsExist();
        assertEquals(1, attempts.get());

        SessionEntity entity = new SessionEntity();
        entity.setSessionId("s1");
        when(sessionRepository.findById("s1")).thenReturn(Optional.of(entity));

        registry.refreshLastRequest("s1");
        assertEquals(2, attempts.get(), "a restored session must retry the registration");

        registry.refreshLastRequest("s1");
        assertEquals(2, attempts.get(), "a successful registration is signalled only once");
    }
}
