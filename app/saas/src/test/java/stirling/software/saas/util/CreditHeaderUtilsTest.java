package stirling.software.saas.util;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.model.Authority;
import stirling.software.proprietary.security.model.User;
import stirling.software.saas.model.TeamCredit;
import stirling.software.saas.model.UserCredit;
import stirling.software.saas.service.CreditService;
import stirling.software.saas.service.SaasTeamExtensionService;
import stirling.software.saas.service.TeamCreditService;

/**
 * Unit tests for {@link CreditHeaderUtils#getRemainingCredits(User, CreditService,
 * TeamCreditService)}.
 *
 * <p>The method resolves a remaining-credit balance by routing between two pools:
 *
 * <ul>
 *   <li><b>Team pool</b> - used only when the user is NOT a limited-API user, has a team, and that
 *       team is not "personal" per {@link SaasTeamExtensionService#isPersonal}.
 *   <li><b>Personal pool</b> - otherwise; looked up by Supabase id first, then API key, else -1.
 * </ul>
 *
 * Any thrown exception is swallowed and yields the sentinel {@code -1}. All collaborators are
 * mocked; the assertions are pure arithmetic on the resolved balance.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class CreditHeaderUtilsTest {

    @Mock private SaasTeamExtensionService saasTeamExtensionService;
    @Mock private CreditService creditService;
    @Mock private TeamCreditService teamCreditService;

    @InjectMocks private CreditHeaderUtils creditHeaderUtils;

    private static final long TEAM_ID = 77L;
    private static final UUID SUPABASE_ID = UUID.fromString("00000000-0000-0000-0000-000000000123");
    private static final String API_KEY = "api-key-abcdef";

    // --- builders -------------------------------------------------------------------------------

    private static User user() {
        User u = new User();
        u.setUsername("tester");
        return u;
    }

    private static Team team(Long id) {
        Team t = new Team();
        t.setId(id);
        t.setName("team-" + id);
        return t;
    }

    /** Authority ctor self-registers on the user's authority set. */
    private static void grant(User u, String role) {
        new Authority(role, u);
    }

    private static UserCredit userCredit(int cycle, int bought) {
        UserCredit c = new UserCredit(user());
        c.setCycleCreditsRemaining(cycle);
        c.setBoughtCreditsRemaining(bought);
        return c;
    }

    private static TeamCredit teamCredit(int cycle, int bought) {
        TeamCredit c = new TeamCredit(team(TEAM_ID));
        c.setCycleCreditsRemaining(cycle);
        c.setBoughtCreditsRemaining(bought);
        return c;
    }

    private int call(User u) {
        return creditHeaderUtils.getRemainingCredits(u, creditService, teamCreditService);
    }

    // --- team pool routing ----------------------------------------------------------------------

    @Nested
    @DisplayName("team pool path (non-limited user on a non-personal team)")
    class TeamPool {

        @Test
        @DisplayName(
                "returns the team's total available credits and never touches personal lookups")
        void nonPersonalTeam_usesTeamPool() {
            User u = user();
            u.setTeam(team(TEAM_ID));
            when(saasTeamExtensionService.isPersonal(u.getTeam())).thenReturn(false);
            when(teamCreditService.getTeamCredits(TEAM_ID))
                    .thenReturn(Optional.of(teamCredit(40, 10)));

            assertThat(call(u)).isEqualTo(50);

            verify(teamCreditService).getTeamCredits(TEAM_ID);
            verifyNoInteractions(creditService);
        }

        @Test
        @DisplayName("missing team credit row yields the -1 sentinel")
        void nonPersonalTeam_missingRow_returnsMinusOne() {
            User u = user();
            u.setSupabaseId(SUPABASE_ID);
            u.setTeam(team(TEAM_ID));
            when(saasTeamExtensionService.isPersonal(u.getTeam())).thenReturn(false);
            when(teamCreditService.getTeamCredits(TEAM_ID)).thenReturn(Optional.empty());

            assertThat(call(u)).isEqualTo(-1);

            // Team path chosen, so the personal supabase lookup must never run.
            verifyNoInteractions(creditService);
        }

        @Test
        @DisplayName("zero team credits returns 0, not the sentinel")
        void nonPersonalTeam_zeroBalance_returnsZero() {
            User u = user();
            u.setTeam(team(TEAM_ID));
            when(saasTeamExtensionService.isPersonal(u.getTeam())).thenReturn(false);
            when(teamCreditService.getTeamCredits(TEAM_ID))
                    .thenReturn(Optional.of(teamCredit(0, 0)));

            assertThat(call(u)).isZero();
        }
    }

    // --- personal pool routing ------------------------------------------------------------------

    @Nested
    @DisplayName("personal pool path")
    class PersonalPool {

        @Test
        @DisplayName("personal team falls through to the user's individual credits")
        void personalTeam_usesPersonalCredits() {
            User u = user();
            u.setSupabaseId(SUPABASE_ID);
            u.setTeam(team(TEAM_ID));
            when(saasTeamExtensionService.isPersonal(u.getTeam())).thenReturn(true);
            when(creditService.getUserCreditsBySupabaseId(SUPABASE_ID.toString()))
                    .thenReturn(Optional.of(userCredit(15, 5)));

            assertThat(call(u)).isEqualTo(20);

            // Personal path chosen -> team pool untouched.
            verify(teamCreditService, never()).getTeamCredits(any());
        }

        @Test
        @DisplayName(
                "no team at all uses personal credits and never consults the extension service")
        void noTeam_usesPersonalCredits() {
            User u = user();
            u.setSupabaseId(SUPABASE_ID);
            when(creditService.getUserCreditsBySupabaseId(SUPABASE_ID.toString()))
                    .thenReturn(Optional.of(userCredit(7, 0)));

            assertThat(call(u)).isEqualTo(7);

            verifyNoInteractions(saasTeamExtensionService);
            verify(teamCreditService, never()).getTeamCredits(any());
        }

        @Test
        @DisplayName("supabase id is preferred over api key when both are present")
        void supabaseIdPreferredOverApiKey() {
            User u = user();
            u.setSupabaseId(SUPABASE_ID);
            u.setApiKey(API_KEY);
            when(creditService.getUserCreditsBySupabaseId(SUPABASE_ID.toString()))
                    .thenReturn(Optional.of(userCredit(3, 4)));

            assertThat(call(u)).isEqualTo(7);

            verify(creditService).getUserCreditsBySupabaseId(SUPABASE_ID.toString());
            verify(creditService, never()).getUserCreditsByApiKey(anyString());
        }

        @Test
        @DisplayName("falls back to api key lookup when supabase id is absent")
        void apiKeyFallback_whenNoSupabaseId() {
            User u = user();
            u.setApiKey(API_KEY);
            when(creditService.getUserCreditsByApiKey(API_KEY))
                    .thenReturn(Optional.of(userCredit(9, 1)));

            assertThat(call(u)).isEqualTo(10);

            verify(creditService).getUserCreditsByApiKey(API_KEY);
            verify(creditService, never()).getUserCreditsBySupabaseId(anyString());
        }

        @Test
        @DisplayName("supabase lookup returning empty yields -1")
        void supabaseLookupEmpty_returnsMinusOne() {
            User u = user();
            u.setSupabaseId(SUPABASE_ID);
            when(creditService.getUserCreditsBySupabaseId(SUPABASE_ID.toString()))
                    .thenReturn(Optional.empty());

            assertThat(call(u)).isEqualTo(-1);
        }

        @Test
        @DisplayName("api key lookup returning empty yields -1")
        void apiKeyLookupEmpty_returnsMinusOne() {
            User u = user();
            u.setApiKey(API_KEY);
            when(creditService.getUserCreditsByApiKey(API_KEY)).thenReturn(Optional.empty());

            assertThat(call(u)).isEqualTo(-1);
        }

        @Test
        @DisplayName("neither supabase id nor api key present yields -1 with no lookups")
        void noIdentifiers_returnsMinusOne() {
            User u = user(); // no supabaseId, no apiKey, no team

            assertThat(call(u)).isEqualTo(-1);

            verifyNoInteractions(creditService);
            verifyNoInteractions(teamCreditService);
        }
    }

    // --- limited-api user override --------------------------------------------------------------

    @Nested
    @DisplayName("limited-api users always read personal credits")
    class LimitedApiOverride {

        @Test
        @DisplayName("ROLE_LIMITED_API_USER on a non-personal team still reads personal credits")
        void limitedApiUser_skipsTeamPool() {
            User u = user();
            u.setApiKey(API_KEY);
            u.setTeam(team(TEAM_ID));
            grant(u, "ROLE_LIMITED_API_USER");
            when(creditService.getUserCreditsByApiKey(API_KEY))
                    .thenReturn(Optional.of(userCredit(2, 0)));

            assertThat(call(u)).isEqualTo(2);

            // The team branch is gated out, so neither the extension nor team-credit services run.
            verifyNoInteractions(saasTeamExtensionService);
            verify(teamCreditService, never()).getTeamCredits(any());
        }

        @Test
        @DisplayName("ROLE_EXTRA_LIMITED_API_USER also forces the personal pool")
        void extraLimitedApiUser_skipsTeamPool() {
            User u = user();
            u.setSupabaseId(SUPABASE_ID);
            u.setTeam(team(TEAM_ID));
            grant(u, "ROLE_EXTRA_LIMITED_API_USER");
            when(creditService.getUserCreditsBySupabaseId(SUPABASE_ID.toString()))
                    .thenReturn(Optional.of(userCredit(6, 0)));

            assertThat(call(u)).isEqualTo(6);

            verifyNoInteractions(saasTeamExtensionService);
            verify(teamCreditService, never()).getTeamCredits(any());
        }

        @Test
        @DisplayName(
                "a non-limited role does not divert a non-personal team member off the team pool")
        void unrelatedRole_keepsTeamPool() {
            User u = user();
            u.setTeam(team(TEAM_ID));
            grant(u, "ROLE_USER");
            when(saasTeamExtensionService.isPersonal(u.getTeam())).thenReturn(false);
            when(teamCreditService.getTeamCredits(TEAM_ID))
                    .thenReturn(Optional.of(teamCredit(11, 0)));

            assertThat(call(u)).isEqualTo(11);

            verify(teamCreditService).getTeamCredits(TEAM_ID);
            verifyNoInteractions(creditService);
        }
    }

    // --- error swallowing -----------------------------------------------------------------------

    @Nested
    @DisplayName("exceptions are swallowed and produce the -1 sentinel")
    class ErrorHandling {

        @Test
        @DisplayName("team credit service throwing is caught and returns -1")
        void teamServiceThrows_returnsMinusOne() {
            User u = user();
            u.setTeam(team(TEAM_ID));
            when(saasTeamExtensionService.isPersonal(u.getTeam())).thenReturn(false);
            when(teamCreditService.getTeamCredits(TEAM_ID))
                    .thenThrow(new RuntimeException("db down"));

            assertThat(call(u)).isEqualTo(-1);
        }

        @Test
        @DisplayName("credit service throwing on personal lookup is caught and returns -1")
        void creditServiceThrows_returnsMinusOne() {
            User u = user();
            u.setSupabaseId(SUPABASE_ID);
            when(creditService.getUserCreditsBySupabaseId(anyString()))
                    .thenThrow(new RuntimeException("lookup boom"));

            assertThat(call(u)).isEqualTo(-1);
        }

        @Test
        @DisplayName(
                "extension service throwing during personal-team check is caught and returns -1")
        void extensionServiceThrows_returnsMinusOne() {
            User u = user();
            u.setSupabaseId(SUPABASE_ID);
            u.setTeam(team(TEAM_ID));
            when(saasTeamExtensionService.isPersonal(u.getTeam()))
                    .thenThrow(new RuntimeException("extension boom"));

            assertThat(call(u)).isEqualTo(-1);
        }
    }
}
