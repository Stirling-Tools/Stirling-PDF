package stirling.software.proprietary.security.session;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.security.core.session.SessionInformation;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.test.util.ReflectionTestUtils;

import stirling.software.proprietary.security.database.repository.SessionRepository;
import stirling.software.proprietary.security.model.SessionEntity;
import stirling.software.proprietary.security.saml2.CustomSaml2AuthenticatedPrincipal;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class SessionPersistentRegistryTest {

    @Mock private SessionRepository sessionRepository;

    @InjectMocks private SessionPersistentRegistry registry;

    @Captor private ArgumentCaptor<SessionEntity> sessionCaptor;

    @BeforeEach
    void setUp() {
        // @Value field is not constructor-injected; set a default like Spring would.
        ReflectionTestUtils.setField(
                registry, "defaultMaxInactiveInterval", Duration.ofMinutes(30));
    }

    private static SessionEntity session(
            String sessionId, String principalName, Instant lastRequest, boolean expired) {
        SessionEntity entity = new SessionEntity();
        entity.setSessionId(sessionId);
        entity.setPrincipalName(principalName);
        entity.setLastRequest(lastRequest);
        entity.setExpired(expired);
        return entity;
    }

    @Nested
    @DisplayName("getAllPrincipals")
    class GetAllPrincipals {

        @Test
        @DisplayName("maps every session to its principal name")
        void returnsPrincipalNamesForAllSessions() {
            Instant now = Instant.now();
            when(sessionRepository.findAll())
                    .thenReturn(
                            List.of(
                                    session("s1", "alice", now, false),
                                    session("s2", "bob", now, true)));

            List<Object> principals = registry.getAllPrincipals();

            assertEquals(List.of("alice", "bob"), principals);
        }

        @Test
        @DisplayName("returns empty list when no sessions exist")
        void returnsEmptyWhenNoSessions() {
            when(sessionRepository.findAll()).thenReturn(Collections.emptyList());

            assertTrue(registry.getAllPrincipals().isEmpty());
        }

        @Test
        @DisplayName("includes null principal names as-is")
        void includesNullPrincipalNames() {
            when(sessionRepository.findAll())
                    .thenReturn(List.of(session("s1", null, Instant.now(), false)));

            List<Object> principals = registry.getAllPrincipals();

            assertEquals(1, principals.size());
            assertNull(principals.get(0));
        }
    }

    @Nested
    @DisplayName("getAllSessions(principal, includeExpiredSessions)")
    class GetAllSessionsForPrincipal {

        @Test
        @DisplayName("resolves principal name from UserDetails")
        void resolvesFromUserDetails() {
            UserDetails userDetails = org.mockito.Mockito.mock(UserDetails.class);
            when(userDetails.getUsername()).thenReturn("alice");
            when(sessionRepository.findByPrincipalName("alice"))
                    .thenReturn(List.of(session("s1", "alice", Instant.now(), false)));

            List<SessionInformation> result = registry.getAllSessions(userDetails, false);

            assertEquals(1, result.size());
            assertEquals("alice", result.get(0).getPrincipal());
            assertEquals("s1", result.get(0).getSessionId());
        }

        @Test
        @DisplayName("resolves principal name from OAuth2User")
        void resolvesFromOAuth2User() {
            OAuth2User oAuth2User = org.mockito.Mockito.mock(OAuth2User.class);
            when(oAuth2User.getName()).thenReturn("oauth-user");
            when(sessionRepository.findByPrincipalName("oauth-user"))
                    .thenReturn(List.of(session("s2", "oauth-user", Instant.now(), false)));

            List<SessionInformation> result = registry.getAllSessions(oAuth2User, false);

            assertEquals(1, result.size());
            assertEquals("oauth-user", result.get(0).getPrincipal());
        }

        @Test
        @DisplayName("resolves principal name from CustomSaml2AuthenticatedPrincipal")
        void resolvesFromSaml2Principal() {
            CustomSaml2AuthenticatedPrincipal saml2User =
                    new CustomSaml2AuthenticatedPrincipal(
                            "saml-user", Collections.emptyMap(), "nameId", Collections.emptyList());
            when(sessionRepository.findByPrincipalName("saml-user"))
                    .thenReturn(List.of(session("s3", "saml-user", Instant.now(), false)));

            List<SessionInformation> result = registry.getAllSessions(saml2User, false);

            assertEquals(1, result.size());
            assertEquals("saml-user", result.get(0).getPrincipal());
        }

        @Test
        @DisplayName("resolves principal name from String")
        void resolvesFromString() {
            when(sessionRepository.findByPrincipalName("plain"))
                    .thenReturn(List.of(session("s4", "plain", Instant.now(), false)));

            List<SessionInformation> result = registry.getAllSessions("plain", false);

            assertEquals(1, result.size());
            assertEquals("plain", result.get(0).getPrincipal());
        }

        @Test
        @DisplayName("unknown principal type yields empty list and no repository call")
        void unknownPrincipalTypeReturnsEmpty() {
            List<SessionInformation> result = registry.getAllSessions(new Object(), true);

            assertTrue(result.isEmpty());
            verify(sessionRepository, never()).findByPrincipalName(any());
        }

        @Test
        @DisplayName("null principal yields empty list and no repository call")
        void nullPrincipalReturnsEmpty() {
            List<SessionInformation> result = registry.getAllSessions(null, true);

            assertTrue(result.isEmpty());
            verify(sessionRepository, never()).findByPrincipalName(any());
        }

        @Test
        @DisplayName("excludes expired sessions when includeExpiredSessions is false")
        void excludesExpiredWhenFlagFalse() {
            Instant now = Instant.now();
            when(sessionRepository.findByPrincipalName("alice"))
                    .thenReturn(
                            List.of(
                                    session("active", "alice", now, false),
                                    session("expired", "alice", now, true)));

            List<SessionInformation> result = registry.getAllSessions("alice", false);

            assertEquals(1, result.size());
            assertEquals("active", result.get(0).getSessionId());
        }

        @Test
        @DisplayName("includes expired sessions when includeExpiredSessions is true")
        void includesExpiredWhenFlagTrue() {
            Instant now = Instant.now();
            when(sessionRepository.findByPrincipalName("alice"))
                    .thenReturn(
                            List.of(
                                    session("active", "alice", now, false),
                                    session("expired", "alice", now, true)));

            List<SessionInformation> result = registry.getAllSessions("alice", true);

            assertEquals(2, result.size());
        }

        @Test
        @DisplayName("maps lastRequest Instant into SessionInformation Date")
        void mapsLastRequestToDate() {
            Instant lastRequest = Instant.ofEpochMilli(1_700_000_000_000L);
            when(sessionRepository.findByPrincipalName("alice"))
                    .thenReturn(List.of(session("s1", "alice", lastRequest, false)));

            List<SessionInformation> result = registry.getAllSessions("alice", false);

            assertEquals(Date.from(lastRequest), result.get(0).getLastRequest());
        }

        @Test
        @DisplayName("returns empty list when no sessions found for principal")
        void emptyWhenNoSessionsForPrincipal() {
            when(sessionRepository.findByPrincipalName("ghost"))
                    .thenReturn(Collections.emptyList());

            assertTrue(registry.getAllSessions("ghost", true).isEmpty());
        }
    }

    @Nested
    @DisplayName("registerNewSession")
    class RegisterNewSession {

        @Test
        @DisplayName("persists a new non-expired session for a String principal")
        void persistsNewSessionForString() {
            Instant before = Instant.now();

            registry.registerNewSession("sid-1", "alice");

            verify(sessionRepository).save(sessionCaptor.capture());
            SessionEntity saved = sessionCaptor.getValue();
            assertEquals("sid-1", saved.getSessionId());
            assertEquals("alice", saved.getPrincipalName());
            assertFalse(saved.isExpired());
            assertNotNull(saved.getLastRequest());
            assertFalse(saved.getLastRequest().isBefore(before));
        }

        @Test
        @DisplayName("resolves principal name from UserDetails")
        void persistsForUserDetails() {
            UserDetails userDetails = org.mockito.Mockito.mock(UserDetails.class);
            when(userDetails.getUsername()).thenReturn("alice");

            registry.registerNewSession("sid-2", userDetails);

            verify(sessionRepository).save(sessionCaptor.capture());
            assertEquals("alice", sessionCaptor.getValue().getPrincipalName());
        }

        @Test
        @DisplayName("resolves principal name from OAuth2User")
        void persistsForOAuth2User() {
            OAuth2User oAuth2User = org.mockito.Mockito.mock(OAuth2User.class);
            when(oAuth2User.getName()).thenReturn("oauth-user");

            registry.registerNewSession("sid-3", oAuth2User);

            verify(sessionRepository).save(sessionCaptor.capture());
            assertEquals("oauth-user", sessionCaptor.getValue().getPrincipalName());
        }

        @Test
        @DisplayName("resolves principal name from CustomSaml2AuthenticatedPrincipal")
        void persistsForSaml2Principal() {
            CustomSaml2AuthenticatedPrincipal saml2User =
                    new CustomSaml2AuthenticatedPrincipal(
                            "saml-user", Collections.emptyMap(), "nameId", Collections.emptyList());

            registry.registerNewSession("sid-4", saml2User);

            verify(sessionRepository).save(sessionCaptor.capture());
            assertEquals("saml-user", sessionCaptor.getValue().getPrincipalName());
        }

        @Test
        @DisplayName("does not persist when principal type is unknown")
        void doesNotPersistForUnknownPrincipal() {
            registry.registerNewSession("sid-5", new Object());

            verify(sessionRepository, never()).save(any());
        }

        @Test
        @DisplayName("does not persist when principal is null")
        void doesNotPersistForNullPrincipal() {
            registry.registerNewSession("sid-6", null);

            verify(sessionRepository, never()).save(any());
        }
    }

    @Nested
    @DisplayName("removeSessionInformation")
    class RemoveSessionInformation {

        @Test
        @DisplayName("deletes the session by id")
        void deletesById() {
            registry.removeSessionInformation("sid-1");

            verify(sessionRepository).deleteById("sid-1");
        }
    }

    @Nested
    @DisplayName("refreshLastRequest")
    class RefreshLastRequest {

        @Test
        @DisplayName("updates lastRequest and saves when session exists")
        void updatesAndSavesWhenPresent() {
            Instant before = Instant.now();
            SessionEntity existing = session("sid-1", "alice", Instant.ofEpochMilli(0L), false);
            when(sessionRepository.findById("sid-1")).thenReturn(Optional.of(existing));

            registry.refreshLastRequest("sid-1");

            verify(sessionRepository).save(sessionCaptor.capture());
            SessionEntity saved = sessionCaptor.getValue();
            assertSame(existing, saved);
            assertFalse(saved.getLastRequest().isBefore(before));
        }

        @Test
        @DisplayName("does nothing when session is absent")
        void noOpWhenAbsent() {
            when(sessionRepository.findById("missing")).thenReturn(Optional.empty());

            registry.refreshLastRequest("missing");

            verify(sessionRepository, never()).save(any());
        }
    }

    @Nested
    @DisplayName("getSessionInformation")
    class GetSessionInformation {

        @Test
        @DisplayName("returns mapped SessionInformation when session exists")
        void returnsInfoWhenPresent() {
            Instant lastRequest = Instant.ofEpochMilli(1_700_000_000_000L);
            when(sessionRepository.findById("sid-1"))
                    .thenReturn(Optional.of(session("sid-1", "alice", lastRequest, false)));

            SessionInformation info = registry.getSessionInformation("sid-1");

            assertNotNull(info);
            assertEquals("alice", info.getPrincipal());
            assertEquals("sid-1", info.getSessionId());
            assertEquals(Date.from(lastRequest), info.getLastRequest());
        }

        @Test
        @DisplayName("returns null when session is absent")
        void returnsNullWhenAbsent() {
            when(sessionRepository.findById("missing")).thenReturn(Optional.empty());

            assertNull(registry.getSessionInformation("missing"));
        }
    }

    @Nested
    @DisplayName("getAllSessionsNotExpired / getAllSessions")
    class PlainGetters {

        @Test
        @DisplayName("getAllSessionsNotExpired queries findByExpired(false)")
        void getAllSessionsNotExpiredDelegates() {
            List<SessionEntity> expected = List.of(session("s1", "alice", Instant.now(), false));
            when(sessionRepository.findByExpired(false)).thenReturn(expected);

            assertSame(expected, registry.getAllSessionsNotExpired());
            verify(sessionRepository).findByExpired(false);
        }

        @Test
        @DisplayName("getAllSessions returns repository findAll result")
        void getAllSessionsDelegates() {
            List<SessionEntity> expected = List.of(session("s1", "alice", Instant.now(), false));
            when(sessionRepository.findAll()).thenReturn(expected);

            assertSame(expected, registry.getAllSessions());
        }
    }

    @Nested
    @DisplayName("expireSession")
    class ExpireSession {

        @Test
        @DisplayName("marks an existing session expired and saves it")
        void marksExpiredWhenPresent() {
            SessionEntity existing = session("sid-1", "alice", Instant.now(), false);
            when(sessionRepository.findById("sid-1")).thenReturn(Optional.of(existing));

            registry.expireSession("sid-1");

            verify(sessionRepository).save(sessionCaptor.capture());
            assertTrue(sessionCaptor.getValue().isExpired());
        }

        @Test
        @DisplayName("does nothing when session is absent")
        void noOpWhenAbsent() {
            when(sessionRepository.findById("missing")).thenReturn(Optional.empty());

            registry.expireSession("missing");

            verify(sessionRepository, never()).save(any());
        }
    }

    @Nested
    @DisplayName("getMaxInactiveInterval")
    class GetMaxInactiveInterval {

        @Test
        @DisplayName("returns configured timeout converted to whole seconds")
        void returnsSecondsFromDuration() {
            ReflectionTestUtils.setField(
                    registry, "defaultMaxInactiveInterval", Duration.ofMinutes(30));

            assertEquals(1800, registry.getMaxInactiveInterval());
        }

        @Test
        @DisplayName("truncates sub-second precision to whole seconds")
        void truncatesToWholeSeconds() {
            ReflectionTestUtils.setField(
                    registry, "defaultMaxInactiveInterval", Duration.ofMillis(1500));

            assertEquals(1, registry.getMaxInactiveInterval());
        }

        @Test
        @DisplayName("returns zero for a zero duration")
        void returnsZeroForZeroDuration() {
            ReflectionTestUtils.setField(registry, "defaultMaxInactiveInterval", Duration.ZERO);

            assertEquals(0, registry.getMaxInactiveInterval());
        }
    }

    @Nested
    @DisplayName("getSessionEntity")
    class GetSessionEntity {

        @Test
        @DisplayName("delegates to findBySessionId")
        void delegatesToFindBySessionId() {
            SessionEntity entity = session("sid-1", "alice", Instant.now(), false);
            when(sessionRepository.findBySessionId("sid-1")).thenReturn(entity);

            assertSame(entity, registry.getSessionEntity("sid-1"));
        }

        @Test
        @DisplayName("returns null when repository returns null")
        void returnsNullWhenRepositoryReturnsNull() {
            when(sessionRepository.findBySessionId("missing")).thenReturn(null);

            assertNull(registry.getSessionEntity("missing"));
        }
    }

    @Nested
    @DisplayName("updateSessionByPrincipalName")
    class UpdateSessionByPrincipalName {

        @Test
        @DisplayName("forwards expired flag, instant and principal to the repository")
        void forwardsArguments() {
            Date lastRequest = new Date(1_700_000_000_000L);

            registry.updateSessionByPrincipalName("alice", true, lastRequest);

            verify(sessionRepository)
                    .saveByPrincipalName(eq(true), eq(lastRequest.toInstant()), eq("alice"));
        }
    }

    @Nested
    @DisplayName("findLatestSession")
    class FindLatestSession {

        @Test
        @DisplayName("returns empty when principal has no sessions")
        void emptyWhenNoSessions() {
            when(sessionRepository.findByPrincipalName("ghost")).thenReturn(new ArrayList<>());

            assertTrue(registry.findLatestSession("ghost").isEmpty());
        }

        @Test
        @DisplayName("returns the session with the most recent lastRequest")
        void returnsMostRecentSession() {
            SessionEntity oldest = session("old", "alice", Instant.ofEpochMilli(1_000L), false);
            SessionEntity newest = session("new", "alice", Instant.ofEpochMilli(3_000L), false);
            SessionEntity middle = session("mid", "alice", Instant.ofEpochMilli(2_000L), false);
            // Unsorted input to exercise the descending sort.
            when(sessionRepository.findByPrincipalName("alice"))
                    .thenReturn(new ArrayList<>(List.of(oldest, newest, middle)));

            Optional<SessionEntity> latest = registry.findLatestSession("alice");

            assertTrue(latest.isPresent());
            assertSame(newest, latest.get());
        }

        @Test
        @DisplayName("returns the single session when only one exists")
        void returnsSingleSession() {
            SessionEntity only = session("only", "alice", Instant.now(), false);
            when(sessionRepository.findByPrincipalName("alice"))
                    .thenReturn(new ArrayList<>(List.of(only)));

            Optional<SessionEntity> latest = registry.findLatestSession("alice");

            assertTrue(latest.isPresent());
            assertSame(only, latest.get());
        }
    }
}
