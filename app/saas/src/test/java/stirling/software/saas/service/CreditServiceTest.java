package stirling.software.saas.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.ApiKeyAuthenticationToken;
import stirling.software.proprietary.security.model.Authority;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.saas.billing.service.StripeUsageReportingService;
import stirling.software.saas.config.CreditsProperties;
import stirling.software.saas.model.CreditConsumptionResult;
import stirling.software.saas.model.TeamCredit;
import stirling.software.saas.model.UserCredit;
import stirling.software.saas.repository.TeamCreditRepository;
import stirling.software.saas.repository.UserCreditRepository;
import stirling.software.saas.service.CreditService.CreditSummary;

/**
 * Unit tests for {@link CreditService}.
 *
 * <p>The service is built with mocked repositories/collaborators and a real {@link
 * SimpleMeterRegistry} (Micrometer counters/gauges are constructed in the ctor and need a live
 * registry). A real {@link CreditsProperties} carries the default role allocations and the default
 * monthly-reset cron/zone so the private allocation + scheduled-reset arithmetic is exercised with
 * production defaults. Credit math is pure arithmetic, so exact numbers are asserted.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class CreditServiceTest {

    @Mock private UserCreditRepository userCreditRepository;
    @Mock private TeamCreditRepository teamCreditRepository;
    @Mock private UserRepository userRepository;
    @Mock private UserService userService;
    @Mock private TeamCreditService teamCreditService;
    @Mock private StripeUsageReportingService stripeUsageReportingService;
    @Mock private SaasUserExtensionService saasUserExtensionService;
    @Mock private SaasTeamExtensionService saasTeamExtensionService;

    private CreditsProperties creditsProperties;
    private MeterRegistry meterRegistry;
    private CreditService service;

    private static final String VALID_SUPABASE = "11111111-1111-1111-1111-111111111111";

    @BeforeEach
    void setUp() {
        // Defensive: another test in the JVM may have left a synchronization registered. Clearing
        // guarantees the no-active-tx path runs the Stripe report synchronously in these tests.
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clear();
        }
        creditsProperties = new CreditsProperties();
        meterRegistry = new SimpleMeterRegistry();
        service =
                new CreditService(
                        userCreditRepository,
                        teamCreditRepository,
                        userRepository,
                        userService,
                        creditsProperties,
                        teamCreditService,
                        stripeUsageReportingService,
                        saasUserExtensionService,
                        saasTeamExtensionService,
                        meterRegistry);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    // ----------------------------------------------------------------------------------------
    // Fixtures
    // ----------------------------------------------------------------------------------------

    private static User user(Long id, String username, String... roles) {
        User u = new User();
        u.setId(id);
        u.setUsername(username);
        for (String role : roles) {
            new Authority(role, u); // constructor adds itself to u.getAuthorities()
        }
        return u;
    }

    /** A UserCredit whose last reset is "now", so getOrCreateUserCredits never triggers a reset. */
    private static UserCredit userCredit(User u, int cycleRemaining, int boughtRemaining) {
        UserCredit c = new UserCredit(u);
        c.setCycleCreditsRemaining(cycleRemaining);
        c.setCycleCreditsAllocated(cycleRemaining);
        c.setBoughtCreditsRemaining(boughtRemaining);
        c.setTotalBoughtCredits(boughtRemaining);
        c.setLastCycleResetAt(LocalDateTime.now());
        return c;
    }

    // ----------------------------------------------------------------------------------------
    // Lookups by API key / Supabase ID / user ID
    // ----------------------------------------------------------------------------------------

    @Nested
    @DisplayName("Lookups")
    class Lookups {

        @Test
        @DisplayName("getUserCreditsByApiKey delegates to repository")
        void byApiKey_delegates() {
            User u = user(1L, "alice");
            UserCredit c = userCredit(u, 5, 0);
            when(userCreditRepository.findByUserApiKey("key")).thenReturn(Optional.of(c));

            assertThat(service.getUserCreditsByApiKey("key")).containsSame(c);
        }

        @Test
        @DisplayName("getUserCreditsBySupabaseId parses a valid UUID and queries the repo")
        void bySupabaseId_validUuid() {
            User u = user(1L, "alice");
            UserCredit c = userCredit(u, 5, 0);
            when(userCreditRepository.findBySupabaseId(UUID.fromString(VALID_SUPABASE)))
                    .thenReturn(Optional.of(c));

            assertThat(service.getUserCreditsBySupabaseId(VALID_SUPABASE)).containsSame(c);
        }

        @Test
        @DisplayName("getUserCreditsBySupabaseId returns empty on malformed UUID (no repo call)")
        void bySupabaseId_invalidUuid() {
            assertThat(service.getUserCreditsBySupabaseId("not-a-uuid")).isEmpty();
            verify(userCreditRepository, never()).findBySupabaseId(any());
        }

        @Test
        @DisplayName("getUserCreditsByUserId delegates to repository")
        void byUserId_delegates() {
            User u = user(7L, "bob");
            UserCredit c = userCredit(u, 3, 1);
            when(userCreditRepository.findByUserId(7L)).thenReturn(Optional.of(c));

            assertThat(service.getUserCreditsByUserId(7L)).containsSame(c);
        }

        @Test
        @DisplayName("getUserBySupabaseId delegates to UserService")
        void userBySupabaseId_delegates() {
            UUID id = UUID.fromString(VALID_SUPABASE);
            User u = user(1L, "alice");
            when(userService.findBySupabaseId(id)).thenReturn(Optional.of(u));

            assertThat(service.getUserBySupabaseId(id)).containsSame(u);
        }
    }

    // ----------------------------------------------------------------------------------------
    // getOrCreateUserCredits — existing (reset / no reset) and creation
    // ----------------------------------------------------------------------------------------

    @Nested
    @DisplayName("getOrCreateUserCredits")
    class GetOrCreate {

        @Test
        @DisplayName("returns the existing row unchanged when no cycle reset is due")
        void existing_noResetDue_returnsAsIs() {
            User u = user(1L, "alice", "ROLE_USER");
            UserCredit existing = userCredit(u, 42, 7); // lastReset = now -> not due
            when(userCreditRepository.findByUser(u)).thenReturn(Optional.of(existing));

            UserCredit result = service.getOrCreateUserCredits(u);

            assertThat(result).isSameAs(existing);
            assertThat(result.getCycleCreditsRemaining()).isEqualTo(42);
            verify(userCreditRepository, never()).save(any());
        }

        @Test
        @DisplayName("resets cycle credits to the role allocation when reset is overdue")
        void existing_resetDue_resetsToAllocation() {
            User u = user(1L, "alice", "ROLE_USER"); // default ROLE_USER -> 50
            UserCredit existing = userCredit(u, 3, 9);
            // Force "reset due": last reset far in the past, before the most-recent scheduled
            // reset.
            existing.setLastCycleResetAt(LocalDateTime.now().minusYears(1));
            when(userCreditRepository.findByUser(u)).thenReturn(Optional.of(existing));
            when(userCreditRepository.save(any(UserCredit.class)))
                    .thenAnswer(inv -> inv.getArgument(0));

            UserCredit result = service.getOrCreateUserCredits(u);

            // Cycle reset to ROLE_USER allocation; bought pool is untouched by resetCycleCredits.
            assertThat(result.getCycleCreditsRemaining()).isEqualTo(50);
            assertThat(result.getCycleCreditsAllocated()).isEqualTo(50);
            assertThat(result.getBoughtCreditsRemaining()).isEqualTo(9);
            verify(userCreditRepository).save(existing);
        }

        @Test
        @DisplayName("creates a new credit row allocated for the user's role when none exists")
        void missing_createsWithAllocation() {
            User u = user(1L, "pro", "ROLE_PRO_USER"); // 500
            when(userCreditRepository.findByUser(u)).thenReturn(Optional.empty());
            when(userCreditRepository.save(any(UserCredit.class)))
                    .thenAnswer(inv -> inv.getArgument(0));

            UserCredit result = service.getOrCreateUserCredits(u);

            assertThat(result.getCycleCreditsRemaining()).isEqualTo(500);
            assertThat(result.getCycleCreditsAllocated()).isEqualTo(500);
            assertThat(result.getLastCycleResetAt()).isNotNull();
            verify(userCreditRepository).save(any(UserCredit.class));
        }
    }

    // ----------------------------------------------------------------------------------------
    // Role-based cycle allocation (exercised via initializeCreditsForUser / getOrCreate)
    // ----------------------------------------------------------------------------------------

    @Nested
    @DisplayName("Cycle allocation by role")
    class Allocation {

        @Test
        @DisplayName("admin with adminUnlimited gets Integer.MAX_VALUE")
        void admin_unlimited() {
            User u = user(1L, "admin", "ROLE_ADMIN");
            when(userCreditRepository.save(any(UserCredit.class)))
                    .thenAnswer(inv -> inv.getArgument(0));

            UserCredit c = service.initializeCreditsForUser(u);

            assertThat(c.getCycleCreditsAllocated()).isEqualTo(Integer.MAX_VALUE);
        }

        @Test
        @DisplayName("admin is bounded by allocation map when adminUnlimited is disabled")
        void admin_bounded_whenUnlimitedDisabled() {
            creditsProperties.getCycle().setAdminUnlimited(false);
            User u = user(1L, "admin", "ROLE_ADMIN"); // map has ROLE_ADMIN -> 1000
            when(userCreditRepository.save(any(UserCredit.class)))
                    .thenAnswer(inv -> inv.getArgument(0));

            UserCredit c = service.initializeCreditsForUser(u);

            assertThat(c.getCycleCreditsAllocated()).isEqualTo(1000);
        }

        @Test
        @DisplayName("internal API user always gets unlimited credits")
        void internalApi_unlimited() {
            User u = user(1L, "internal", "ROLE_INTERNAL_API_USER");
            when(userCreditRepository.save(any(UserCredit.class)))
                    .thenAnswer(inv -> inv.getArgument(0));

            UserCredit c = service.initializeCreditsForUser(u);

            assertThat(c.getCycleCreditsAllocated()).isEqualTo(Integer.MAX_VALUE);
        }

        @Test
        @DisplayName("pro user gets the configured ROLE_PRO_USER allocation")
        void pro_getsConfiguredAmount() {
            User u = user(1L, "pro", "ROLE_PRO_USER");
            when(userCreditRepository.save(any(UserCredit.class)))
                    .thenAnswer(inv -> inv.getArgument(0));

            UserCredit c = service.initializeCreditsForUser(u);

            assertThat(c.getCycleCreditsAllocated()).isEqualTo(500);
        }

        @Test
        @DisplayName("unknown role falls back to ROLE_USER default allocation")
        void unknownRole_defaultsToUser() {
            User u = user(1L, "mystery", "ROLE_SOMETHING_ELSE");
            when(userCreditRepository.save(any(UserCredit.class)))
                    .thenAnswer(inv -> inv.getArgument(0));

            UserCredit c = service.initializeCreditsForUser(u);

            assertThat(c.getCycleCreditsAllocated()).isEqualTo(50);
        }

        @Test
        @DisplayName("user with no roles gets zero allocation (rolesString empty, default path)")
        void noRoles_defaultAllocation() {
            // getRolesAsString() returns "" (not null) for a user with no authorities, so the
            // null-guard is skipped and the ROLE_USER default applies.
            User u = user(1L, "empty");
            when(userCreditRepository.save(any(UserCredit.class)))
                    .thenAnswer(inv -> inv.getArgument(0));

            UserCredit c = service.initializeCreditsForUser(u);

            assertThat(c.getCycleCreditsAllocated()).isEqualTo(50);
        }
    }

    // ----------------------------------------------------------------------------------------
    // hasCreditsAvailable (by API key) — present / lazy-create / no user
    // ----------------------------------------------------------------------------------------

    @Nested
    @DisplayName("hasCreditsAvailable by API key")
    class HasCreditsApiKey {

        @Test
        @DisplayName("true when an existing row has a positive balance")
        void existingRow_positive_true() {
            User u = user(1L, "alice");
            when(userCreditRepository.findByUserApiKey("key"))
                    .thenReturn(Optional.of(userCredit(u, 5, 0)));

            assertThat(service.hasCreditsAvailable("key")).isTrue();
        }

        @Test
        @DisplayName("false when an existing row is fully depleted")
        void existingRow_zero_false() {
            User u = user(1L, "alice");
            when(userCreditRepository.findByUserApiKey("key"))
                    .thenReturn(Optional.of(userCredit(u, 0, 0)));

            assertThat(service.hasCreditsAvailable("key")).isFalse();
        }

        @Test
        @DisplayName("lazy-creates credits for a user that has no row yet")
        void noRow_userExists_lazyCreates() {
            User u = user(1L, "alice", "ROLE_PRO_USER");
            when(userCreditRepository.findByUserApiKey("key")).thenReturn(Optional.empty());
            when(userRepository.findByApiKey("key")).thenReturn(Optional.of(u));
            when(userCreditRepository.findByUser(u)).thenReturn(Optional.empty());
            when(userCreditRepository.save(any(UserCredit.class)))
                    .thenAnswer(inv -> inv.getArgument(0));

            assertThat(service.hasCreditsAvailable("key")).isTrue(); // 500 allocated
            verify(userCreditRepository).save(any(UserCredit.class));
        }

        @Test
        @DisplayName("false when no user is found for the API key")
        void noUser_false() {
            when(userCreditRepository.findByUserApiKey("key")).thenReturn(Optional.empty());
            when(userRepository.findByApiKey("key")).thenReturn(Optional.empty());

            assertThat(service.hasCreditsAvailable("key")).isFalse();
        }
    }

    // ----------------------------------------------------------------------------------------
    // consumeCredit (by API key) — atomic update success/failure
    // ----------------------------------------------------------------------------------------

    @Nested
    @DisplayName("consumeCredit by API key")
    class ConsumeApiKey {

        @Test
        @DisplayName("returns true when the atomic update affects exactly one row")
        void oneRowUpdated_true() {
            when(userCreditRepository.consumeCredit("key", 3)).thenReturn(1);

            assertThat(service.consumeCredit("key", 3)).isTrue();
        }

        @Test
        @DisplayName("returns false when no row is updated (insufficient credits)")
        void zeroRowsUpdated_false() {
            when(userCreditRepository.consumeCredit("key", 3)).thenReturn(0);

            assertThat(service.consumeCredit("key", 3)).isFalse();
        }
    }

    // ----------------------------------------------------------------------------------------
    // consumeCreditBySupabaseId — prepaid, metered (full free / overage), errors
    // ----------------------------------------------------------------------------------------

    @Nested
    @DisplayName("consumeCreditBySupabaseId")
    class ConsumeBySupabase {

        @Test
        @DisplayName("invalid UUID returns false without touching the user service")
        void invalidUuid_false() {
            assertThat(service.consumeCreditBySupabaseId("nope", 1)).isFalse();
            verify(userService, never()).findBySupabaseId(any());
        }

        @Test
        @DisplayName("missing user returns false")
        void missingUser_false() {
            when(userService.findBySupabaseId(any())).thenReturn(Optional.empty());

            assertThat(service.consumeCreditBySupabaseId(VALID_SUPABASE, 1)).isFalse();
        }

        @Test
        @DisplayName("prepaid (non-metered) user: one-row update returns true")
        void prepaid_success() {
            User u = user(1L, "pro", "ROLE_PRO_USER");
            UUID id = UUID.fromString(VALID_SUPABASE);
            when(userService.findBySupabaseId(id)).thenReturn(Optional.of(u));
            when(saasUserExtensionService.isMeteredBillingEnabled(u)).thenReturn(false);
            when(userCreditRepository.consumeCreditBySupabaseId(id, 4)).thenReturn(1);

            assertThat(service.consumeCreditBySupabaseId(VALID_SUPABASE, 4)).isTrue();
        }

        @Test
        @DisplayName("prepaid user: zero-row update returns false (insufficient credits)")
        void prepaid_insufficient_false() {
            User u = user(1L, "pro", "ROLE_PRO_USER");
            UUID id = UUID.fromString(VALID_SUPABASE);
            when(userService.findBySupabaseId(id)).thenReturn(Optional.of(u));
            when(saasUserExtensionService.isMeteredBillingEnabled(u)).thenReturn(false);
            when(userCreditRepository.consumeCreditBySupabaseId(id, 4)).thenReturn(0);

            assertThat(service.consumeCreditBySupabaseId(VALID_SUPABASE, 4)).isFalse();
        }

        @Test
        @DisplayName("metered user fully covered by free tier consumes from free tier only")
        void metered_fullyFree_noStripe() {
            User u = user(1L, "meter", "ROLE_PRO_USER");
            UUID id = UUID.fromString(VALID_SUPABASE);
            when(userService.findBySupabaseId(id)).thenReturn(Optional.of(u));
            when(saasUserExtensionService.isMeteredBillingEnabled(u)).thenReturn(true);
            when(userCreditRepository.findByUser(u)).thenReturn(Optional.of(userCredit(u, 10, 0)));
            when(userCreditRepository.consumeCreditBySupabaseId(id, 4)).thenReturn(1);

            assertThat(service.consumeCreditBySupabaseId(VALID_SUPABASE, 4)).isTrue();

            // Wholly covered by the free tier -> no Stripe report at all.
            verify(stripeUsageReportingService, never())
                    .reportUsageToStripe(anyString(), anyInt(), anyString());
        }

        @Test
        @DisplayName(
                "metered user: overage consumes free credits then reports the overage to Stripe")
        void metered_overage_reportsOverage() {
            User u = user(1L, "meter", "ROLE_PRO_USER");
            UUID id = UUID.fromString(VALID_SUPABASE);
            when(userService.findBySupabaseId(id)).thenReturn(Optional.of(u));
            when(saasUserExtensionService.isMeteredBillingEnabled(u)).thenReturn(true);
            // 3 free credits remain; need 10 -> 3 free + 7 overage.
            when(userCreditRepository.findByUser(u)).thenReturn(Optional.of(userCredit(u, 3, 0)));
            when(userCreditRepository.consumeCreditBySupabaseId(id, 3)).thenReturn(1);
            when(stripeUsageReportingService.generateIdempotencyKey(
                            eq(VALID_SUPABASE), eq(7), any()))
                    .thenReturn("idem-key");
            when(stripeUsageReportingService.reportUsageToStripe(VALID_SUPABASE, 7, "idem-key"))
                    .thenReturn(true);

            boolean result = service.consumeCreditBySupabaseId(VALID_SUPABASE, 10);

            assertThat(result).isTrue();
            // Free portion debited in-tx; overage (7) metered to Stripe (sync, no active tx).
            verify(userCreditRepository).consumeCreditBySupabaseId(id, 3);
            verify(stripeUsageReportingService).reportUsageToStripe(VALID_SUPABASE, 7, "idem-key");
        }

        @Test
        @DisplayName("metered user: full overage (no free credits) reports the entire amount")
        void metered_fullOverage_reportsAll() {
            User u = user(1L, "meter", "ROLE_PRO_USER");
            UUID id = UUID.fromString(VALID_SUPABASE);
            when(userService.findBySupabaseId(id)).thenReturn(Optional.of(u));
            when(saasUserExtensionService.isMeteredBillingEnabled(u)).thenReturn(true);
            when(userCreditRepository.findByUser(u)).thenReturn(Optional.of(userCredit(u, 0, 0)));
            when(stripeUsageReportingService.generateIdempotencyKey(
                            eq(VALID_SUPABASE), eq(5), any()))
                    .thenReturn("idem-key");
            when(stripeUsageReportingService.reportUsageToStripe(VALID_SUPABASE, 5, "idem-key"))
                    .thenReturn(true);

            boolean result = service.consumeCreditBySupabaseId(VALID_SUPABASE, 5);

            assertThat(result).isTrue();
            // No free credits to debit, so no DB consume; whole 5 metered.
            verify(userCreditRepository, never()).consumeCreditBySupabaseId(any(), anyInt());
            verify(stripeUsageReportingService).reportUsageToStripe(VALID_SUPABASE, 5, "idem-key");
        }

        @Test
        @DisplayName("metered overage still returns true even when the Stripe report fails")
        void metered_overage_stripeFails_stillTrue() {
            // The DB debit already committed; a Stripe failure is logged + counted but the call
            // succeeds so the user is not double-charged for an unbilled-but-owed overage.
            User u = user(1L, "meter", "ROLE_PRO_USER");
            UUID id = UUID.fromString(VALID_SUPABASE);
            when(userService.findBySupabaseId(id)).thenReturn(Optional.of(u));
            when(saasUserExtensionService.isMeteredBillingEnabled(u)).thenReturn(true);
            when(userCreditRepository.findByUser(u)).thenReturn(Optional.of(userCredit(u, 0, 0)));
            when(stripeUsageReportingService.generateIdempotencyKey(
                            eq(VALID_SUPABASE), eq(5), any()))
                    .thenReturn("idem-key");
            when(stripeUsageReportingService.reportUsageToStripe(VALID_SUPABASE, 5, "idem-key"))
                    .thenReturn(false);

            assertThat(service.consumeCreditBySupabaseId(VALID_SUPABASE, 5)).isTrue();
        }

        @Test
        @DisplayName("metered free-tier debit lost a concurrent race -> returns false")
        void metered_freeTierRaceLost_false() {
            // In-memory check said free tier covers it, but the atomic UPDATE found 0 rows.
            User u = user(1L, "meter", "ROLE_PRO_USER");
            UUID id = UUID.fromString(VALID_SUPABASE);
            when(userService.findBySupabaseId(id)).thenReturn(Optional.of(u));
            when(saasUserExtensionService.isMeteredBillingEnabled(u)).thenReturn(true);
            when(userCreditRepository.findByUser(u)).thenReturn(Optional.of(userCredit(u, 10, 0)));
            when(userCreditRepository.consumeCreditBySupabaseId(id, 4)).thenReturn(0);

            assertThat(service.consumeCreditBySupabaseId(VALID_SUPABASE, 4)).isFalse();
        }
    }

    // ----------------------------------------------------------------------------------------
    // hasCreditsAvailableBySupabaseId
    // ----------------------------------------------------------------------------------------

    @Nested
    @DisplayName("hasCreditsAvailableBySupabaseId")
    class HasCreditsSupabase {

        @Test
        @DisplayName("true for an existing row with a positive balance")
        void existing_positive_true() {
            User u = user(1L, "alice");
            when(userCreditRepository.findBySupabaseId(UUID.fromString(VALID_SUPABASE)))
                    .thenReturn(Optional.of(userCredit(u, 2, 0)));

            assertThat(service.hasCreditsAvailableBySupabaseId(VALID_SUPABASE)).isTrue();
        }

        @Test
        @DisplayName("lazy-creates a row for a user without one")
        void noRow_lazyCreates() {
            User u = user(1L, "alice", "ROLE_USER");
            UUID id = UUID.fromString(VALID_SUPABASE);
            when(userCreditRepository.findBySupabaseId(id)).thenReturn(Optional.empty());
            when(userService.findBySupabaseId(id)).thenReturn(Optional.of(u));
            when(userCreditRepository.findByUser(u)).thenReturn(Optional.empty());
            when(userCreditRepository.save(any(UserCredit.class)))
                    .thenAnswer(inv -> inv.getArgument(0));

            assertThat(service.hasCreditsAvailableBySupabaseId(VALID_SUPABASE)).isTrue();
        }

        @Test
        @DisplayName("false when the UUID is malformed")
        void invalidUuid_false() {
            assertThat(service.hasCreditsAvailableBySupabaseId("bad")).isFalse();
        }

        @Test
        @DisplayName("false when no user exists for a well-formed UUID")
        void noUser_false() {
            UUID id = UUID.fromString(VALID_SUPABASE);
            when(userCreditRepository.findBySupabaseId(id)).thenReturn(Optional.empty());
            when(userService.findBySupabaseId(id)).thenReturn(Optional.empty());

            assertThat(service.hasCreditsAvailableBySupabaseId(VALID_SUPABASE)).isFalse();
        }
    }

    // ----------------------------------------------------------------------------------------
    // Authentication-based helpers
    // ----------------------------------------------------------------------------------------

    @Nested
    @DisplayName("Authentication helpers")
    class AuthHelpers {

        @Test
        @DisplayName("getUserCreditsFromAuthentication returns empty when no auth is present")
        void noAuth_empty() {
            SecurityContextHolder.clearContext();
            assertThat(service.getUserCreditsFromAuthentication()).isEmpty();
        }

        @Test
        @DisplayName("API-key auth resolves credits by the principal user's id")
        void apiKeyAuth_resolvesById() {
            User u = user(9L, "alice");
            UserCredit c = userCredit(u, 3, 0);
            ApiKeyAuthenticationToken auth =
                    new ApiKeyAuthenticationToken(
                            u, "sk-test", List.of(new SimpleGrantedAuthority("ROLE_USER")));
            SecurityContextHolder.getContext().setAuthentication(auth);
            when(userCreditRepository.findByUserId(9L)).thenReturn(Optional.of(c));

            assertThat(service.getUserCreditsFromAuthentication()).containsSame(c);
        }

        @Test
        @DisplayName("JWT/session (UsernamePassword) auth resolves credits by the principal id")
        void jwtAuth_resolvesById() {
            User u = user(9L, "alice");
            UserCredit c = userCredit(u, 3, 0);
            // 3-arg ctor -> authenticated principal.
            UsernamePasswordAuthenticationToken auth =
                    new UsernamePasswordAuthenticationToken(
                            u, "pw", List.of(new SimpleGrantedAuthority("ROLE_USER")));
            SecurityContextHolder.getContext().setAuthentication(auth);
            when(userCreditRepository.findByUserId(9L)).thenReturn(Optional.of(c));

            assertThat(service.getUserCreditsFromAuthentication()).containsSame(c);
        }

        @Test
        @DisplayName("isApiKeyAuthenticated true only for an ApiKeyAuthenticationToken")
        void isApiKeyAuthenticated() {
            User u = user(9L, "alice");
            SecurityContextHolder.getContext()
                    .setAuthentication(
                            new ApiKeyAuthenticationToken(
                                    u, "sk", List.of(new SimpleGrantedAuthority("ROLE_USER"))));
            assertThat(service.isApiKeyAuthenticated()).isTrue();
            assertThat(service.isJwtAuthenticated()).isFalse();
        }

        @Test
        @DisplayName("isJwtAuthenticated true only for a UsernamePasswordAuthenticationToken")
        void isJwtAuthenticated() {
            User u = user(9L, "alice");
            SecurityContextHolder.getContext()
                    .setAuthentication(
                            new UsernamePasswordAuthenticationToken(
                                    u, "pw", List.of(new SimpleGrantedAuthority("ROLE_USER"))));
            assertThat(service.isJwtAuthenticated()).isTrue();
            assertThat(service.isApiKeyAuthenticated()).isFalse();
        }
    }

    // ----------------------------------------------------------------------------------------
    // Admin credit mutations by username
    // ----------------------------------------------------------------------------------------

    @Nested
    @DisplayName("Credit mutations by username")
    class MutationsByUsername {

        @Test
        @DisplayName("addBoughtCredits adds to the bought pool and persists")
        void addBought_addsAndSaves() {
            User u = user(1L, "alice", "ROLE_USER");
            UserCredit c = userCredit(u, 10, 5);
            when(userRepository.findByUsername("alice")).thenReturn(Optional.of(u));
            when(userCreditRepository.findByUser(u)).thenReturn(Optional.of(c));

            service.addBoughtCredits("alice", 20);

            assertThat(c.getBoughtCreditsRemaining()).isEqualTo(25);
            assertThat(c.getTotalBoughtCredits()).isEqualTo(25);
            verify(userCreditRepository).save(c);
        }

        @Test
        @DisplayName("addBoughtCredits throws when the user does not exist")
        void addBought_missingUser_throws() {
            when(userRepository.findByUsername("ghost")).thenReturn(Optional.empty());

            assertThatThrownBy(() -> service.addBoughtCredits("ghost", 5))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("User not found");
        }

        @Test
        @DisplayName("setBoughtCredits overwrites both remaining and total bought")
        void setBought_overwrites() {
            User u = user(1L, "alice", "ROLE_USER");
            UserCredit c = userCredit(u, 10, 99);
            when(userRepository.findByUsername("alice")).thenReturn(Optional.of(u));
            when(userCreditRepository.findByUser(u)).thenReturn(Optional.of(c));

            service.setBoughtCredits("alice", 7);

            assertThat(c.getBoughtCreditsRemaining()).isEqualTo(7);
            assertThat(c.getTotalBoughtCredits()).isEqualTo(7);
            verify(userCreditRepository).save(c);
        }

        @Test
        @DisplayName("setCycleCredits overwrites only the cycle remaining pool")
        void setCycle_overwritesCycleOnly() {
            User u = user(1L, "alice", "ROLE_USER");
            UserCredit c = userCredit(u, 10, 8);
            when(userRepository.findByUsername("alice")).thenReturn(Optional.of(u));
            when(userCreditRepository.findByUser(u)).thenReturn(Optional.of(c));

            service.setCycleCredits("alice", 3);

            assertThat(c.getCycleCreditsRemaining()).isEqualTo(3);
            assertThat(c.getBoughtCreditsRemaining()).isEqualTo(8);
            verify(userCreditRepository).save(c);
        }

        @Test
        @DisplayName("setCycleCredits throws when the user does not exist")
        void setCycle_missingUser_throws() {
            when(userRepository.findByUsername("ghost")).thenReturn(Optional.empty());

            assertThatThrownBy(() -> service.setCycleCredits("ghost", 5))
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }

    // ----------------------------------------------------------------------------------------
    // Admin credit mutations by Supabase ID
    // ----------------------------------------------------------------------------------------

    @Nested
    @DisplayName("Credit mutations by Supabase ID")
    class MutationsBySupabase {

        @Test
        @DisplayName("addBoughtCreditsBySupabaseId adds to the bought pool")
        void addBought_adds() {
            User u = user(1L, "alice", "ROLE_USER");
            UUID id = UUID.fromString(VALID_SUPABASE);
            UserCredit c = userCredit(u, 10, 5);
            when(userService.findBySupabaseId(id)).thenReturn(Optional.of(u));
            when(userCreditRepository.findByUser(u)).thenReturn(Optional.of(c));

            service.addBoughtCreditsBySupabaseId(VALID_SUPABASE, 15);

            assertThat(c.getBoughtCreditsRemaining()).isEqualTo(20);
            verify(userCreditRepository).save(c);
        }

        @Test
        @DisplayName("setCycleCreditsBySupabaseId overwrites the cycle remaining pool")
        void setCycle_overwrites() {
            User u = user(1L, "alice", "ROLE_USER");
            UUID id = UUID.fromString(VALID_SUPABASE);
            UserCredit c = userCredit(u, 10, 5);
            when(userService.findBySupabaseId(id)).thenReturn(Optional.of(u));
            when(userCreditRepository.findByUser(u)).thenReturn(Optional.of(c));

            service.setCycleCreditsBySupabaseId(VALID_SUPABASE, 2);

            assertThat(c.getCycleCreditsRemaining()).isEqualTo(2);
            verify(userCreditRepository).save(c);
        }

        @Test
        @DisplayName("mutation by Supabase ID throws when the user is missing")
        void missingUser_throws() {
            UUID id = UUID.fromString(VALID_SUPABASE);
            when(userService.findBySupabaseId(id)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> service.setBoughtCreditsBySupabaseId(VALID_SUPABASE, 5))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("User not found");
        }

        @Test
        @DisplayName("mutation by Supabase ID throws on a malformed UUID")
        void invalidUuid_throws() {
            assertThatThrownBy(() -> service.setBoughtCreditsBySupabaseId("bad-uuid", 5))
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }

    // ----------------------------------------------------------------------------------------
    // Cycle resets for all users / teams
    // ----------------------------------------------------------------------------------------

    @Nested
    @DisplayName("Bulk cycle resets")
    class BulkResets {

        @Test
        @DisplayName("resetCycleCreditsForAllUsers resets each candidate to its role allocation")
        void resetUsers_perRoleAllocation() {
            LocalDateTime cutoff = LocalDateTime.now();
            User proUser = user(1L, "pro", "ROLE_PRO_USER"); // 500
            User freeUser = user(2L, "free", "ROLE_USER"); // 50
            UserCredit proCredit = userCredit(proUser, 1, 0);
            UserCredit freeCredit = userCredit(freeUser, 1, 0);
            when(userCreditRepository.findCreditsNeedingCycleReset(cutoff))
                    .thenReturn(List.of(proCredit, freeCredit));

            service.resetCycleCreditsForAllUsers(cutoff);

            assertThat(proCredit.getCycleCreditsRemaining()).isEqualTo(500);
            assertThat(proCredit.getLastCycleResetAt()).isEqualTo(cutoff);
            assertThat(freeCredit.getCycleCreditsRemaining()).isEqualTo(50);
            verify(userCreditRepository).save(proCredit);
            verify(userCreditRepository).save(freeCredit);
        }

        @Test
        @DisplayName(
                "resetCycleCreditsForAllUsers no-arg overload uses 'now' and saves nothing when empty")
        void resetUsers_noArg_emptyList() {
            when(userCreditRepository.findCreditsNeedingCycleReset(any(LocalDateTime.class)))
                    .thenReturn(List.of());

            service.resetCycleCreditsForAllUsers();

            verify(userCreditRepository, never()).save(any());
        }

        @Test
        @DisplayName("resetCycleCreditsForAllTeams resets each team to the fixed PRO allocation")
        void resetTeams_fixedProAllocation() {
            LocalDateTime cutoff = LocalDateTime.now();
            Team team = new Team();
            team.setId(100L);
            TeamCredit tc = new TeamCredit(team);
            tc.setCycleCreditsRemaining(1);
            when(teamCreditRepository.findCreditsNeedingCycleReset(cutoff)).thenReturn(List.of(tc));

            service.resetCycleCreditsForAllTeams(cutoff);

            // Fixed PRO amount from the allocation map (ROLE_PRO_USER -> 500).
            assertThat(tc.getCycleCreditsRemaining()).isEqualTo(500);
            assertThat(tc.getCycleCreditsAllocated()).isEqualTo(500);
            assertThat(tc.getLastCycleResetAt()).isEqualTo(cutoff);
            verify(teamCreditRepository).save(tc);
        }
    }

    // ----------------------------------------------------------------------------------------
    // Credit summaries
    // ----------------------------------------------------------------------------------------

    @Nested
    @DisplayName("Credit summaries")
    class Summaries {

        @Test
        @DisplayName("getCreditSummaryByApiKey returns an empty summary when no row exists")
        void byApiKey_missing_empty() {
            when(userCreditRepository.findByUserApiKey("key")).thenReturn(Optional.empty());

            CreditSummary summary = service.getCreditSummaryByApiKey("key");

            assertThat(summary.totalAvailableCredits).isZero();
            assertThat(summary.unlimited).isFalse();
        }

        @Test
        @DisplayName("getCreditSummaryByApiKey maps the row fields and flags unlimited correctly")
        void byApiKey_mapsFields() {
            User u = user(1L, "alice");
            UserCredit c = userCredit(u, 30, 12);
            c.setCycleCreditsAllocated(50);
            when(userCreditRepository.findByUserApiKey("key")).thenReturn(Optional.of(c));

            CreditSummary summary = service.getCreditSummaryByApiKey("key");

            assertThat(summary.cycleCreditsRemaining).isEqualTo(30);
            assertThat(summary.cycleCreditsAllocated).isEqualTo(50);
            assertThat(summary.boughtCreditsRemaining).isEqualTo(12);
            assertThat(summary.totalAvailableCredits).isEqualTo(42);
            assertThat(summary.unlimited).isFalse();
        }

        @Test
        @DisplayName("getCreditSummaryByApiKey flags unlimited when cycle allocation is MAX_VALUE")
        void byApiKey_unlimited() {
            User u = user(1L, "admin");
            UserCredit c = userCredit(u, 5, 0);
            c.setCycleCreditsAllocated(Integer.MAX_VALUE);
            when(userCreditRepository.findByUserApiKey("key")).thenReturn(Optional.of(c));

            assertThat(service.getCreditSummaryByApiKey("key").unlimited).isTrue();
        }

        @Test
        @DisplayName("getCreditSummary(username) returns an empty summary for an unknown username")
        void byUsername_missing_empty() {
            when(userRepository.findByUsername("ghost")).thenReturn(Optional.empty());

            assertThat(service.getCreditSummary("ghost").totalAvailableCredits).isZero();
        }

        @Test
        @DisplayName("getCreditSummary(username) maps the (lazily resolved) credit row")
        void byUsername_maps() {
            User u = user(1L, "alice", "ROLE_USER");
            UserCredit c = userCredit(u, 20, 5);
            when(userRepository.findByUsername("alice")).thenReturn(Optional.of(u));
            when(userCreditRepository.findByUser(u)).thenReturn(Optional.of(c));

            CreditSummary summary = service.getCreditSummary("alice");

            assertThat(summary.cycleCreditsRemaining).isEqualTo(20);
            assertThat(summary.totalAvailableCredits).isEqualTo(25);
        }

        @Test
        @DisplayName("getCreditSummaryBySupabaseId returns empty for a malformed UUID")
        void bySupabase_invalidUuid_empty() {
            assertThat(service.getCreditSummaryBySupabaseId("bad").totalAvailableCredits).isZero();
        }

        @Test
        @DisplayName("getCreditSummaryBySupabaseId returns empty when no user is found")
        void bySupabase_noUser_empty() {
            UUID id = UUID.fromString(VALID_SUPABASE);
            when(userService.findBySupabaseId(id)).thenReturn(Optional.empty());

            assertThat(service.getCreditSummaryBySupabaseId(VALID_SUPABASE).totalAvailableCredits)
                    .isZero();
        }

        @Test
        @DisplayName("non-personal team member gets the shared team pool, never personal credits")
        void bySupabase_teamMember_returnsTeamPool() {
            User u = user(1L, "teamie", "ROLE_USER");
            Team team = new Team();
            team.setId(100L);
            u.setTeam(team);
            UUID id = UUID.fromString(VALID_SUPABASE);
            when(userService.findBySupabaseId(id)).thenReturn(Optional.of(u));
            when(saasTeamExtensionService.isPersonal(team)).thenReturn(false);

            TeamCredit tc = new TeamCredit(team);
            tc.setCycleCreditsRemaining(300);
            tc.setCycleCreditsAllocated(500);
            tc.setBoughtCreditsRemaining(50);
            tc.setTotalBoughtCredits(50);
            when(teamCreditService.getTeamCredits(100L)).thenReturn(Optional.of(tc));

            CreditSummary summary = service.getCreditSummaryBySupabaseId(VALID_SUPABASE);

            assertThat(summary.cycleCreditsRemaining).isEqualTo(300);
            assertThat(summary.totalAvailableCredits).isEqualTo(350);
            assertThat(summary.unlimited).isFalse();
            // Team path: personal credits must not be consulted.
            verify(userCreditRepository, never()).findBySupabaseId(any());
        }

        @Test
        @DisplayName("non-personal team with no credit record returns an empty summary")
        void bySupabase_teamMember_noTeamCredit_empty() {
            User u = user(1L, "teamie", "ROLE_USER");
            Team team = new Team();
            team.setId(100L);
            u.setTeam(team);
            UUID id = UUID.fromString(VALID_SUPABASE);
            when(userService.findBySupabaseId(id)).thenReturn(Optional.of(u));
            when(saasTeamExtensionService.isPersonal(team)).thenReturn(false);
            when(teamCreditService.getTeamCredits(100L)).thenReturn(Optional.empty());

            assertThat(service.getCreditSummaryBySupabaseId(VALID_SUPABASE).totalAvailableCredits)
                    .isZero();
        }

        @Test
        @DisplayName("limited API team member uses personal credits, not the team pool")
        void bySupabase_limitedApiUser_usesPersonal() {
            User u = user(1L, "limited", "ROLE_LIMITED_API_USER");
            Team team = new Team();
            team.setId(100L);
            u.setTeam(team);
            UUID id = UUID.fromString(VALID_SUPABASE);
            when(userService.findBySupabaseId(id)).thenReturn(Optional.of(u));
            when(userCreditRepository.findBySupabaseId(id))
                    .thenReturn(Optional.of(userCredit(u, 8, 0)));

            CreditSummary summary = service.getCreditSummaryBySupabaseId(VALID_SUPABASE);

            assertThat(summary.cycleCreditsRemaining).isEqualTo(8);
            // Limited API users never consult the team pool.
            verify(teamCreditService, never()).getTeamCredits(any());
        }

        @Test
        @DisplayName("personal-team user returns personal credits")
        void bySupabase_personalTeam_returnsPersonal() {
            User u = user(1L, "solo", "ROLE_USER");
            Team team = new Team();
            team.setId(100L);
            u.setTeam(team);
            UUID id = UUID.fromString(VALID_SUPABASE);
            when(userService.findBySupabaseId(id)).thenReturn(Optional.of(u));
            when(saasTeamExtensionService.isPersonal(team)).thenReturn(true);
            when(userCreditRepository.findBySupabaseId(id))
                    .thenReturn(Optional.of(userCredit(u, 15, 5)));

            CreditSummary summary = service.getCreditSummaryBySupabaseId(VALID_SUPABASE);

            assertThat(summary.totalAvailableCredits).isEqualTo(20);
            verify(teamCreditService, never()).getTeamCredits(any());
        }

        @Test
        @DisplayName("teamless personal user with no row triggers lazy initialization")
        void bySupabase_noRow_lazyInit() {
            User u = user(1L, "fresh", "ROLE_PRO_USER"); // 500
            UUID id = UUID.fromString(VALID_SUPABASE);
            when(userService.findBySupabaseId(id)).thenReturn(Optional.of(u));
            when(userCreditRepository.findBySupabaseId(id)).thenReturn(Optional.empty());
            when(userCreditRepository.save(any(UserCredit.class)))
                    .thenAnswer(inv -> inv.getArgument(0));

            CreditSummary summary = service.getCreditSummaryBySupabaseId(VALID_SUPABASE);

            assertThat(summary.cycleCreditsAllocated).isEqualTo(500);
            verify(userCreditRepository).save(any(UserCredit.class));
        }
    }

    // ----------------------------------------------------------------------------------------
    // Role-change refresh / allocation reset
    // ----------------------------------------------------------------------------------------

    @Nested
    @DisplayName("Role-change credit refresh")
    class RoleChange {

        @Test
        @DisplayName(
                "refreshCreditsAfterRoleChange fully resets cycle credits to the new allocation")
        void refresh_resetsToNewAllocation() {
            User u = user(1L, "upgraded", "ROLE_PRO_USER"); // new allocation 500
            UserCredit c = userCredit(u, 3, 40); // had only 3 cycle, 40 bought
            when(userCreditRepository.findByUserId(1L)).thenReturn(Optional.of(c));

            service.refreshCreditsAfterRoleChange(u);

            assertThat(c.getCycleCreditsRemaining()).isEqualTo(500);
            assertThat(c.getCycleCreditsAllocated()).isEqualTo(500);
            // Bought pool is preserved across a role change.
            assertThat(c.getBoughtCreditsRemaining()).isEqualTo(40);
            verify(userCreditRepository).save(c);
        }

        @Test
        @DisplayName("refreshCreditsAfterRoleChange initializes credits when none exist")
        void refresh_noRow_initializes() {
            User u = user(1L, "new", "ROLE_USER");
            when(userCreditRepository.findByUserId(1L)).thenReturn(Optional.empty());
            when(userCreditRepository.save(any(UserCredit.class)))
                    .thenAnswer(inv -> inv.getArgument(0));

            service.refreshCreditsAfterRoleChange(u);

            ArgumentCaptor<UserCredit> captor = ArgumentCaptor.forClass(UserCredit.class);
            verify(userCreditRepository).save(captor.capture());
            assertThat(captor.getValue().getCycleCreditsAllocated()).isEqualTo(50);
        }

        @Test
        @DisplayName("resetCycleAllocationForRoleChange performs a full reset to the given amount")
        void resetAllocation_fullReset() {
            User u = user(1L, "alice", "ROLE_USER");
            UserCredit c = userCredit(u, 10, 25);
            when(userCreditRepository.findByUserId(1L)).thenReturn(Optional.of(c));

            service.resetCycleAllocationForRoleChange(1L, 200);

            assertThat(c.getCycleCreditsRemaining()).isEqualTo(200);
            assertThat(c.getCycleCreditsAllocated()).isEqualTo(200);
            assertThat(c.getBoughtCreditsRemaining()).isEqualTo(25);
            verify(userCreditRepository).save(c);
        }

        @Test
        @DisplayName("resetCycleAllocationForRoleChange throws when the user has no credit row")
        void resetAllocation_missingRow_throws() {
            when(userCreditRepository.findByUserId(1L)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> service.resetCycleAllocationForRoleChange(1L, 200))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("User credits not found");
        }
    }

    // ----------------------------------------------------------------------------------------
    // consumeCreditWithWaterfall — the explicit Pro-billing waterfall
    // ----------------------------------------------------------------------------------------

    @Nested
    @DisplayName("consumeCreditWithWaterfall")
    class Waterfall {

        @Test
        @DisplayName("internal backend API user is unlimited; no Supabase ID needed")
        void internalApiUser_unlimited() {
            User u = user(1L, "backend", "STIRLING-PDF-BACKEND-API-USER");

            CreditConsumptionResult result = service.consumeCreditWithWaterfall(u, 100, true);

            assertThat(result.isSuccess()).isTrue();
            assertThat(result.getSource()).isEqualTo("INTERNAL_API_UNLIMITED");
            verify(userCreditRepository, never()).hasCycleCredits(any(), anyInt());
        }

        @Test
        @DisplayName("user without a Supabase ID fails")
        void noSupabaseId_failure() {
            User u = user(1L, "noid", "ROLE_PRO_USER");
            u.setSupabaseId(null);

            CreditConsumptionResult result = service.consumeCreditWithWaterfall(u, 5, true);

            assertThat(result.isSuccess()).isFalse();
            assertThat(result.getMessage()).contains("no Supabase ID");
        }

        @Test
        @DisplayName("step 1: consumes from cycle credits when available")
        void cycleCredits_consumed() {
            User u = user(1L, "pro", "ROLE_PRO_USER");
            UUID id = UUID.fromString(VALID_SUPABASE);
            u.setSupabaseId(id);
            when(userCreditRepository.hasCycleCredits(id, 5)).thenReturn(Boolean.TRUE);
            when(userCreditRepository.consumeCycleCredits(id, 5)).thenReturn(1);

            CreditConsumptionResult result = service.consumeCreditWithWaterfall(u, 5, true);

            assertThat(result.isSuccess()).isTrue();
            assertThat(result.getSource()).isEqualTo("CYCLE_CREDITS");
            verify(userCreditRepository, never()).hasBoughtCredits(any(), anyInt());
        }

        @Test
        @DisplayName("step 2: falls through to bought credits when cycle credits are insufficient")
        void boughtCredits_consumed() {
            User u = user(1L, "pro", "ROLE_PRO_USER");
            UUID id = UUID.fromString(VALID_SUPABASE);
            u.setSupabaseId(id);
            when(userCreditRepository.hasCycleCredits(id, 5)).thenReturn(Boolean.FALSE);
            when(userCreditRepository.hasBoughtCredits(id, 5)).thenReturn(Boolean.TRUE);
            when(userCreditRepository.consumeBoughtCredits(id, 5)).thenReturn(1);

            CreditConsumptionResult result = service.consumeCreditWithWaterfall(u, 5, true);

            assertThat(result.isSuccess()).isTrue();
            assertThat(result.getSource()).isEqualTo("BOUGHT_CREDITS");
        }

        @Test
        @DisplayName("cycle check passes but the atomic update loses a race -> falls to bought")
        void cycleRaceLost_fallsToBought() {
            User u = user(1L, "pro", "ROLE_PRO_USER");
            UUID id = UUID.fromString(VALID_SUPABASE);
            u.setSupabaseId(id);
            when(userCreditRepository.hasCycleCredits(id, 5)).thenReturn(Boolean.TRUE);
            when(userCreditRepository.consumeCycleCredits(id, 5)).thenReturn(0); // lost the race
            when(userCreditRepository.hasBoughtCredits(id, 5)).thenReturn(Boolean.TRUE);
            when(userCreditRepository.consumeBoughtCredits(id, 5)).thenReturn(1);

            CreditConsumptionResult result = service.consumeCreditWithWaterfall(u, 5, true);

            assertThat(result.isSuccess()).isTrue();
            assertThat(result.getSource()).isEqualTo("BOUGHT_CREDITS");
        }

        @Test
        @DisplayName("step 3: metered billing schedules a Stripe report and succeeds")
        void metered_subscription_success() {
            User u = user(1L, "meter", "ROLE_PRO_USER");
            UUID id = UUID.fromString(VALID_SUPABASE);
            u.setSupabaseId(id);
            when(userCreditRepository.hasCycleCredits(id, 5)).thenReturn(Boolean.FALSE);
            when(userCreditRepository.hasBoughtCredits(id, 5)).thenReturn(Boolean.FALSE);
            when(saasUserExtensionService.isMeteredBillingEnabled(u)).thenReturn(true);
            when(stripeUsageReportingService.generateIdempotencyKey(
                            eq(VALID_SUPABASE), eq(5), any()))
                    .thenReturn("idem-key");
            when(stripeUsageReportingService.reportUsageToStripe(VALID_SUPABASE, 5, "idem-key"))
                    .thenReturn(true);

            CreditConsumptionResult result = service.consumeCreditWithWaterfall(u, 5, true);

            assertThat(result.isSuccess()).isTrue();
            assertThat(result.getSource()).isEqualTo("METERED_SUBSCRIPTION");
            // No active tx -> report runs synchronously with the full amount.
            verify(stripeUsageReportingService).reportUsageToStripe(VALID_SUPABASE, 5, "idem-key");
        }

        @Test
        @DisplayName(
                "Pro user without metered billing is rejected with the overage-billing message")
        void proWithoutMetered_rejected() {
            User u = user(1L, "pro", "ROLE_PRO_USER");
            UUID id = UUID.fromString(VALID_SUPABASE);
            u.setSupabaseId(id);
            when(userCreditRepository.hasCycleCredits(id, 5)).thenReturn(Boolean.FALSE);
            when(userCreditRepository.hasBoughtCredits(id, 5)).thenReturn(Boolean.FALSE);
            when(saasUserExtensionService.isMeteredBillingEnabled(u)).thenReturn(false);

            CreditConsumptionResult result = service.consumeCreditWithWaterfall(u, 5, true);

            assertThat(result.isSuccess()).isFalse();
            assertThat(result.getMessage()).contains("overage billing");
        }

        @Test
        @DisplayName("non-Pro user with no credit source is rejected as INSUFFICIENT_CREDITS")
        void nonPro_noSource_insufficient() {
            User u = user(1L, "free", "ROLE_USER");
            UUID id = UUID.fromString(VALID_SUPABASE);
            u.setSupabaseId(id);
            when(userCreditRepository.hasCycleCredits(id, 5)).thenReturn(Boolean.FALSE);
            when(userCreditRepository.hasBoughtCredits(id, 5)).thenReturn(Boolean.FALSE);
            when(saasUserExtensionService.isMeteredBillingEnabled(u)).thenReturn(false);

            CreditConsumptionResult result = service.consumeCreditWithWaterfall(u, 5, true);

            assertThat(result.isSuccess()).isFalse();
            assertThat(result.getMessage()).isEqualTo("INSUFFICIENT_CREDITS");
        }
    }

    // ----------------------------------------------------------------------------------------
    // CreditSummary value holder
    // ----------------------------------------------------------------------------------------

    @Nested
    @DisplayName("CreditSummary value holder")
    class SummaryHolder {

        @Test
        @DisplayName("no-arg constructor zeroes everything and is not unlimited")
        void emptySummary() {
            CreditSummary s = new CreditSummary();

            assertThat(s.cycleCreditsRemaining).isZero();
            assertThat(s.cycleCreditsAllocated).isZero();
            assertThat(s.boughtCreditsRemaining).isZero();
            assertThat(s.totalBoughtCredits).isZero();
            assertThat(s.totalAvailableCredits).isZero();
            assertThat(s.cycleResetDate).isNull();
            assertThat(s.lastApiUsage).isNull();
            assertThat(s.unlimited).isFalse();
        }

        @Test
        @DisplayName("all-args constructor wires public fields verbatim")
        void fullSummary() {
            LocalDateTime reset = LocalDateTime.now();
            LocalDateTime usage = reset.plusMinutes(1);
            CreditSummary s = new CreditSummary(30, 50, 12, 100, 42, reset, usage, true);

            assertThat(s.cycleCreditsRemaining).isEqualTo(30);
            assertThat(s.cycleCreditsAllocated).isEqualTo(50);
            assertThat(s.boughtCreditsRemaining).isEqualTo(12);
            assertThat(s.totalBoughtCredits).isEqualTo(100);
            assertThat(s.totalAvailableCredits).isEqualTo(42);
            assertThat(s.cycleResetDate).isEqualTo(reset);
            assertThat(s.lastApiUsage).isEqualTo(usage);
            assertThat(s.unlimited).isTrue();
        }
    }
}
