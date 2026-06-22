package stirling.software.saas.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
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

import stirling.software.common.model.enumeration.Role;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.AuthenticationType;
import stirling.software.proprietary.security.model.Authority;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.saas.model.SupabaseUser;

/**
 * Unit tests for {@link SaasUserAccountService}.
 *
 * <p>The service is a thin orchestration layer over {@link UserService} and the saas extension
 * services; every collaborator is mocked and the methods are invoked directly. Role state is driven
 * through {@link User#getRolesAsString()} by attaching an {@link Authority} (its constructor
 * registers itself on the user). Anonymous state is driven through {@link
 * User#setAuthenticationType(AuthenticationType)}, which the entity stores lowercased so the
 * service's case-insensitive comparison against {@code ANONYMOUS} matches.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class SaasUserAccountServiceTest {

    @Mock private UserService userService;
    @Mock private UserRepository userRepository;
    @Mock private UserRoleService userRoleService;
    @Mock private SupabaseUserService supabaseUserService;
    @Mock private SaasUserExtensionService saasUserExtensionService;
    @Mock private SaasTeamExtensionService saasTeamExtensionService;
    @Mock private SaasTeamService saasTeamService;

    @InjectMocks private SaasUserAccountService service;

    private static final String SUPABASE_ID = "11111111-2222-3333-4444-555555555555";
    private static final UUID SUPABASE_UUID = UUID.fromString(SUPABASE_ID);

    /** Build a user whose role string equals the given role id (e.g. "ROLE_USER"). */
    private static User userWithRole(String roleId) {
        User u = new User();
        u.setUsername("alice@example.com");
        // Authority's constructor registers itself onto the user's authority set.
        new Authority(roleId, u);
        return u;
    }

    private static Team team(Long id, String name) {
        Team t = new Team();
        t.setId(id);
        t.setName(name);
        return t;
    }

    @Nested
    @DisplayName("getUserBySupabaseId")
    class GetUserBySupabaseId {

        @Test
        @DisplayName("returns the local user when the UUID parses and a row exists")
        void returnsUser() {
            User u = userWithRole(Role.USER.getRoleId());
            when(userService.findBySupabaseId(SUPABASE_UUID)).thenReturn(Optional.of(u));

            assertThat(service.getUserBySupabaseId(SUPABASE_ID)).isSameAs(u);
        }

        @Test
        @DisplayName("throws with an 'invalid format' message when the id is not a UUID")
        void invalidFormat_throws() {
            assertThatThrownBy(() -> service.getUserBySupabaseId("not-a-uuid"))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("Invalid Supabase ID format")
                    .hasMessageContaining("not-a-uuid");

            verifyNoInteractions(userService);
        }

        @Test
        @DisplayName("throws 'user not found' when the UUID parses but no local row exists")
        void notFound_throws() {
            when(userService.findBySupabaseId(SUPABASE_UUID)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> service.getUserBySupabaseId(SUPABASE_ID))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("User not found for Supabase ID")
                    .hasMessageContaining(SUPABASE_ID);
        }
    }

    @Nested
    @DisplayName("handleUpgrade")
    class HandleUpgrade {

        @Test
        @DisplayName("promotes a free (ROLE_USER) user to PRO and returns true")
        void freeUser_isUpgraded() {
            User u = userWithRole(Role.USER.getRoleId());
            when(userService.findBySupabaseId(SUPABASE_UUID)).thenReturn(Optional.of(u));

            boolean upgraded = service.handleUpgrade(SUPABASE_ID);

            assertThat(upgraded).isTrue();
            verify(userRoleService).upgradeToPro(u);
        }

        @Test
        @DisplayName("returns false and does not re-upgrade a user already on PRO")
        void proUser_isNoOp() {
            User u = userWithRole(Role.PRO_USER.getRoleId());
            when(userService.findBySupabaseId(SUPABASE_UUID)).thenReturn(Optional.of(u));

            boolean upgraded = service.handleUpgrade(SUPABASE_ID);

            assertThat(upgraded).isFalse();
            verify(userRoleService, never()).upgradeToPro(any());
        }

        @Test
        @DisplayName("returns false for any non-free role (e.g. admin/other) without upgrading")
        void otherRole_isNoOp() {
            User u = userWithRole("ROLE_ADMIN");
            when(userService.findBySupabaseId(SUPABASE_UUID)).thenReturn(Optional.of(u));

            assertThat(service.handleUpgrade(SUPABASE_ID)).isFalse();
            verify(userRoleService, never()).upgradeToPro(any());
        }

        @Test
        @DisplayName("propagates the lookup failure when the supabase id has no local user")
        void unknownUser_propagates() {
            when(userService.findBySupabaseId(SUPABASE_UUID)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> service.handleUpgrade(SUPABASE_ID))
                    .isInstanceOf(IllegalArgumentException.class);
            verifyNoInteractions(userRoleService);
        }
    }

    @Nested
    @DisplayName("handleDowngrade")
    class HandleDowngrade {

        @Test
        @DisplayName("downgrades a PRO user with no team to FREE and returns true")
        void proWithoutTeam_isDowngraded() {
            User u = userWithRole(Role.PRO_USER.getRoleId());
            // no team set -> getTeam() is null
            when(userService.findBySupabaseId(SUPABASE_UUID)).thenReturn(Optional.of(u));

            boolean downgraded = service.handleDowngrade(SUPABASE_ID);

            assertThat(downgraded).isTrue();
            verify(userRoleService).downgradeToFree(u);
        }

        @Test
        @DisplayName(
                "downgrades a PRO user whose team is personal (personal team is not a shared PRO source)")
        void proWithPersonalTeam_isDowngraded() {
            User u = userWithRole(Role.PRO_USER.getRoleId());
            Team t = team(7L, "alice-personal");
            u.setTeam(t);
            when(userService.findBySupabaseId(SUPABASE_UUID)).thenReturn(Optional.of(u));
            when(saasTeamExtensionService.isPersonal(t)).thenReturn(true);

            boolean downgraded = service.handleDowngrade(SUPABASE_ID);

            assertThat(downgraded).isTrue();
            verify(userRoleService).downgradeToFree(u);
        }

        @Test
        @DisplayName("keeps PRO (returns false) for a PRO user on a non-personal/shared team")
        void proWithSharedTeam_keepsPro() {
            User u = userWithRole(Role.PRO_USER.getRoleId());
            Team t = team(9L, "acme-team");
            u.setTeam(t);
            when(userService.findBySupabaseId(SUPABASE_UUID)).thenReturn(Optional.of(u));
            when(saasTeamExtensionService.isPersonal(t)).thenReturn(false);

            boolean downgraded = service.handleDowngrade(SUPABASE_ID);

            assertThat(downgraded).isFalse();
            verify(userRoleService, never()).downgradeToFree(any());
        }

        @Test
        @DisplayName("returns false without touching roles when the user is already FREE")
        void freeUser_isNoOp() {
            User u = userWithRole(Role.USER.getRoleId());
            when(userService.findBySupabaseId(SUPABASE_UUID)).thenReturn(Optional.of(u));

            assertThat(service.handleDowngrade(SUPABASE_ID)).isFalse();
            verify(userRoleService, never()).downgradeToFree(any());
            verifyNoInteractions(saasTeamExtensionService);
        }
    }

    @Nested
    @DisplayName("enableMeteredBilling")
    class EnableMeteredBilling {

        @Test
        @DisplayName("enables metered billing and returns true when it was off")
        void wasOff_enables() {
            User u = userWithRole(Role.PRO_USER.getRoleId());
            when(userService.findBySupabaseId(SUPABASE_UUID)).thenReturn(Optional.of(u));
            when(saasUserExtensionService.isMeteredBillingEnabled(u)).thenReturn(false);

            boolean result = service.enableMeteredBilling(SUPABASE_ID);

            assertThat(result).isTrue();
            verify(saasUserExtensionService).setMeteredBillingEnabled(u, true);
        }

        @Test
        @DisplayName("returns false and does not re-enable when metered billing is already on")
        void alreadyOn_isNoOp() {
            User u = userWithRole(Role.PRO_USER.getRoleId());
            when(userService.findBySupabaseId(SUPABASE_UUID)).thenReturn(Optional.of(u));
            when(saasUserExtensionService.isMeteredBillingEnabled(u)).thenReturn(true);

            boolean result = service.enableMeteredBilling(SUPABASE_ID);

            assertThat(result).isFalse();
            verify(saasUserExtensionService, never()).setMeteredBillingEnabled(any(), anyBoolean());
        }
    }

    @Nested
    @DisplayName("disableMeteredBilling")
    class DisableMeteredBilling {

        @Test
        @DisplayName("disables metered billing and returns true when it was on")
        void wasOn_disables() {
            User u = userWithRole(Role.USER.getRoleId());
            when(userService.findBySupabaseId(SUPABASE_UUID)).thenReturn(Optional.of(u));
            when(saasUserExtensionService.isMeteredBillingEnabled(u)).thenReturn(true);

            boolean result = service.disableMeteredBilling(SUPABASE_ID);

            assertThat(result).isTrue();
            verify(saasUserExtensionService).setMeteredBillingEnabled(u, false);
        }

        @Test
        @DisplayName("returns false and does nothing when metered billing is already off")
        void alreadyOff_isNoOp() {
            User u = userWithRole(Role.USER.getRoleId());
            when(userService.findBySupabaseId(SUPABASE_UUID)).thenReturn(Optional.of(u));
            when(saasUserExtensionService.isMeteredBillingEnabled(u)).thenReturn(false);

            boolean result = service.disableMeteredBilling(SUPABASE_ID);

            assertThat(result).isFalse();
            verify(saasUserExtensionService, never()).setMeteredBillingEnabled(any(), anyBoolean());
        }
    }

    @Nested
    @DisplayName("synchronizeUserUpgrade")
    class SynchronizeUserUpgrade {

        private static SupabaseUser supabaseUser(boolean anonymous) {
            SupabaseUser su = new SupabaseUser();
            su.setId(SUPABASE_UUID);
            su.setAnonymous(anonymous);
            return su;
        }

        private static User anonymousLocalUser() {
            User u = new User();
            u.setUsername("anon-handle");
            u.setAuthenticationType(AuthenticationType.ANONYMOUS);
            return u;
        }

        @Test
        @DisplayName("throws IllegalStateException when no local user is linked to the supabase id")
        void noLinkedUser_throws() {
            SupabaseUser su = supabaseUser(true);
            when(userService.findBySupabaseId(SUPABASE_UUID)).thenReturn(Optional.empty());

            assertThatThrownBy(
                            () -> service.synchronizeUserUpgrade(su, "alice@example.com", "google"))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("No local user linked to Supabase ID");

            verifyNoInteractions(supabaseUserService);
        }

        @Test
        @DisplayName("flips the supabase anonymous mirror to false and saves it")
        void anonymousMirror_isFlippedAndSaved() {
            SupabaseUser su = supabaseUser(true);
            User u = anonymousLocalUser();
            when(userService.findBySupabaseId(SUPABASE_UUID)).thenReturn(Optional.of(u));
            when(userService.saveUser(any(User.class))).thenAnswer(inv -> inv.getArgument(0));

            service.synchronizeUserUpgrade(su, "alice@example.com", "web");

            assertThat(su.isAnonymous()).isFalse();
            verify(supabaseUserService).save(su);
        }

        @Test
        @DisplayName("does not save the supabase mirror when it was already non-anonymous")
        void nonAnonymousMirror_isNotSaved() {
            SupabaseUser su = supabaseUser(false);
            User u = anonymousLocalUser();
            when(userService.findBySupabaseId(SUPABASE_UUID)).thenReturn(Optional.of(u));
            when(userService.saveUser(any(User.class))).thenAnswer(inv -> inv.getArgument(0));

            service.synchronizeUserUpgrade(su, "alice@example.com", "web");

            verify(supabaseUserService, never()).save(any());
        }

        @Test
        @DisplayName("promotes an anonymous local user to WEB and copies the email into username")
        void anonymousLocalUser_promotedToWeb() {
            SupabaseUser su = supabaseUser(false);
            User u = anonymousLocalUser();
            when(userService.findBySupabaseId(SUPABASE_UUID)).thenReturn(Optional.of(u));
            when(userService.saveUser(any(User.class))).thenAnswer(inv -> inv.getArgument(0));

            User result = service.synchronizeUserUpgrade(su, "alice@example.com", "web");

            assertThat(result).isSameAs(u);
            // setAuthenticationType stores the enum name lowercased.
            assertThat(u.getAuthenticationType()).isEqualTo("web");
            assertThat(u.getEmail()).isEqualTo("alice@example.com");
            assertThat(u.getUsername()).isEqualTo("alice@example.com");
            verify(userService).saveUser(u);
            // Upgrading from anon gives the user their own team.
            verify(saasTeamService).ensurePersonalTeam(u);
        }

        @Test
        @DisplayName("maps a known OAuth provider (google) to OAUTH2 auth type")
        void oauthProvider_mapsToOauth2() {
            SupabaseUser su = supabaseUser(false);
            User u = anonymousLocalUser();
            when(userService.findBySupabaseId(SUPABASE_UUID)).thenReturn(Optional.of(u));
            when(userService.saveUser(any(User.class))).thenAnswer(inv -> inv.getArgument(0));

            service.synchronizeUserUpgrade(su, "alice@example.com", "google");

            assertThat(u.getAuthenticationType()).isEqualTo("oauth2");
        }

        @Test
        @DisplayName("maps a generic 'oauth' authMethod to OAUTH2")
        void genericOauth_mapsToOauth2() {
            SupabaseUser su = supabaseUser(false);
            User u = anonymousLocalUser();
            when(userService.findBySupabaseId(SUPABASE_UUID)).thenReturn(Optional.of(u));
            when(userService.saveUser(any(User.class))).thenAnswer(inv -> inv.getArgument(0));

            service.synchronizeUserUpgrade(su, "alice@example.com", "oauth");

            assertThat(u.getAuthenticationType()).isEqualTo("oauth2");
        }

        @Test
        @DisplayName("maps an unknown authMethod to WEB")
        void unknownMethod_mapsToWeb() {
            SupabaseUser su = supabaseUser(false);
            User u = anonymousLocalUser();
            when(userService.findBySupabaseId(SUPABASE_UUID)).thenReturn(Optional.of(u));
            when(userService.saveUser(any(User.class))).thenAnswer(inv -> inv.getArgument(0));

            service.synchronizeUserUpgrade(su, "alice@example.com", "carrier-pigeon");

            assertThat(u.getAuthenticationType()).isEqualTo("web");
        }

        @Test
        @DisplayName("maps a null authMethod to WEB")
        void nullMethod_mapsToWeb() {
            SupabaseUser su = supabaseUser(false);
            User u = anonymousLocalUser();
            when(userService.findBySupabaseId(SUPABASE_UUID)).thenReturn(Optional.of(u));
            when(userService.saveUser(any(User.class))).thenAnswer(inv -> inv.getArgument(0));

            service.synchronizeUserUpgrade(su, "alice@example.com", null);

            assertThat(u.getAuthenticationType()).isEqualTo("web");
        }

        @Test
        @DisplayName(
                "does not overwrite username/email when the email is blank, but still promotes the type")
        void blankEmail_keepsUsername() {
            SupabaseUser su = supabaseUser(false);
            User u = anonymousLocalUser();
            when(userService.findBySupabaseId(SUPABASE_UUID)).thenReturn(Optional.of(u));
            when(userService.saveUser(any(User.class))).thenAnswer(inv -> inv.getArgument(0));

            service.synchronizeUserUpgrade(su, "   ", "google");

            assertThat(u.getAuthenticationType()).isEqualTo("oauth2");
            assertThat(u.getUsername()).isEqualTo("anon-handle");
            assertThat(u.getEmail()).isNull();
            verify(userService).saveUser(u);
        }

        @Test
        @DisplayName("does not overwrite username/email when the email is null")
        void nullEmail_keepsUsername() {
            SupabaseUser su = supabaseUser(false);
            User u = anonymousLocalUser();
            when(userService.findBySupabaseId(SUPABASE_UUID)).thenReturn(Optional.of(u));
            when(userService.saveUser(any(User.class))).thenAnswer(inv -> inv.getArgument(0));

            service.synchronizeUserUpgrade(su, null, "web");

            assertThat(u.getUsername()).isEqualTo("anon-handle");
            assertThat(u.getEmail()).isNull();
        }

        @Test
        @DisplayName("leaves a non-anonymous local user untouched and never saves it")
        void nonAnonymousLocalUser_untouched() {
            SupabaseUser su = supabaseUser(false);
            User u = new User();
            u.setUsername("existing@example.com");
            u.setAuthenticationType(AuthenticationType.WEB);
            when(userService.findBySupabaseId(SUPABASE_UUID)).thenReturn(Optional.of(u));

            User result = service.synchronizeUserUpgrade(su, "new@example.com", "google");

            assertThat(result).isSameAs(u);
            assertThat(u.getUsername()).isEqualTo("existing@example.com");
            assertThat(u.getAuthenticationType()).isEqualTo("web");
            verify(userService, never()).saveUser(any());
            verify(saasTeamService, never()).ensurePersonalTeam(any());
        }

        @Test
        @DisplayName("anonymous comparison is case-insensitive (stored type is lowercased)")
        void anonymousTypeMatchesCaseInsensitively() {
            SupabaseUser su = supabaseUser(false);
            User u = anonymousLocalUser();
            // sanity: the entity stored the lowercase form, exercising the equalsIgnoreCase branch
            assertThat(u.getAuthenticationType()).isEqualTo("anonymous");
            when(userService.findBySupabaseId(SUPABASE_UUID)).thenReturn(Optional.of(u));
            when(userService.saveUser(any(User.class))).thenAnswer(inv -> inv.getArgument(0));

            service.synchronizeUserUpgrade(su, "alice@example.com", "web");

            verify(userService).saveUser(u);
        }
    }
}
