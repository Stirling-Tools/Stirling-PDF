package stirling.software.saas.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.security.Principal;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import stirling.software.proprietary.security.model.AuthenticationType;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.saas.model.SupabaseUser;
import stirling.software.saas.service.SaasUserAccountService;
import stirling.software.saas.service.SupabaseUserService;

/**
 * Pure-Mockito unit tests for {@link UserRoleWebhookController}.
 *
 * <p>The controller is built via {@code @RequiredArgsConstructor}, so {@link InjectMocks} wires the
 * three mocked collaborators ({@link UserService}, {@link SaasUserAccountService}, {@link
 * SupabaseUserService}) by type. Each handler is invoked directly and the returned {@link
 * ResponseEntity} (status + body) is asserted, alongside collaborator interaction verification. No
 * Spring context, DB, Supabase or network is involved; {@code @PreAuthorize} is a no-op outside the
 * security proxy so authorization is not exercised here.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class UserRoleWebhookControllerTest {

    @Mock private UserService userService;
    @Mock private SaasUserAccountService saasUserAccountService;
    @Mock private SupabaseUserService supabaseUserService;

    @InjectMocks private UserRoleWebhookController controller;

    private static final String SUPABASE_ID = "11111111-2222-3333-4444-555555555555";

    @Nested
    @DisplayName("POST /upgrade")
    class HandleUpgrade {

        @Test
        @DisplayName("returns 200 with 'upgraded' message when a promotion happened")
        void upgraded() {
            when(saasUserAccountService.handleUpgrade(SUPABASE_ID)).thenReturn(true);

            ResponseEntity<String> response = controller.handleUpgrade(SUPABASE_ID);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(response.getBody()).isEqualTo("User upgraded to PRO successfully");
            verify(saasUserAccountService).handleUpgrade(SUPABASE_ID);
        }

        @Test
        @DisplayName("returns 200 with 'already PRO' message when nothing changed")
        void alreadyPro() {
            when(saasUserAccountService.handleUpgrade(SUPABASE_ID)).thenReturn(false);

            ResponseEntity<String> response = controller.handleUpgrade(SUPABASE_ID);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(response.getBody()).isEqualTo("User is already PRO");
        }

        @Test
        @DisplayName(
                "maps IllegalArgumentException (bad/unknown supabaseId) to 400 'Invalid request'")
        void illegalArgumentMapsTo400() {
            when(saasUserAccountService.handleUpgrade(SUPABASE_ID))
                    .thenThrow(new IllegalArgumentException("Invalid Supabase ID format"));

            ResponseEntity<String> response = controller.handleUpgrade(SUPABASE_ID);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(response.getBody()).isEqualTo("Invalid request");
        }

        @Test
        @DisplayName("maps any other exception to 500 'Error processing webhook'")
        void unexpectedExceptionMapsTo500() {
            when(saasUserAccountService.handleUpgrade(SUPABASE_ID))
                    .thenThrow(new RuntimeException("db down"));

            ResponseEntity<String> response = controller.handleUpgrade(SUPABASE_ID);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
            assertThat(response.getBody()).isEqualTo("Error processing webhook");
        }
    }

    @Nested
    @DisplayName("POST /downgrade")
    class HandleDowngrade {

        @Test
        @DisplayName("returns 200 with 'downgraded' message when a demotion happened")
        void downgraded() {
            when(saasUserAccountService.handleDowngrade(SUPABASE_ID)).thenReturn(true);

            ResponseEntity<String> response = controller.handleDowngrade(SUPABASE_ID);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(response.getBody()).isEqualTo("User downgraded to FREE successfully");
            verify(saasUserAccountService).handleDowngrade(SUPABASE_ID);
        }

        @Test
        @DisplayName("returns 200 with 'already FREE' message when nothing changed")
        void alreadyFree() {
            when(saasUserAccountService.handleDowngrade(SUPABASE_ID)).thenReturn(false);

            ResponseEntity<String> response = controller.handleDowngrade(SUPABASE_ID);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(response.getBody()).isEqualTo("User is already on FREE tier");
        }

        @Test
        @DisplayName("maps IllegalArgumentException to 400 'Invalid request'")
        void illegalArgumentMapsTo400() {
            when(saasUserAccountService.handleDowngrade(SUPABASE_ID))
                    .thenThrow(new IllegalArgumentException("User not found for Supabase ID"));

            ResponseEntity<String> response = controller.handleDowngrade(SUPABASE_ID);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(response.getBody()).isEqualTo("Invalid request");
        }

        @Test
        @DisplayName("maps any other exception to 500 'Error processing webhook'")
        void unexpectedExceptionMapsTo500() {
            when(saasUserAccountService.handleDowngrade(SUPABASE_ID))
                    .thenThrow(new RuntimeException("boom"));

            ResponseEntity<String> response = controller.handleDowngrade(SUPABASE_ID);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
            assertThat(response.getBody()).isEqualTo("Error processing webhook");
        }
    }

    @Nested
    @DisplayName("POST /enable-metered-billing")
    class EnableMeteredBilling {

        @Test
        @DisplayName("returns 200 'enabled' when metered billing is newly turned on")
        void enabled() {
            when(saasUserAccountService.enableMeteredBilling(SUPABASE_ID)).thenReturn(true);

            ResponseEntity<String> response = controller.enableMeteredBilling(SUPABASE_ID);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(response.getBody()).isEqualTo("Metered billing enabled successfully");
            verify(saasUserAccountService).enableMeteredBilling(SUPABASE_ID);
        }

        @Test
        @DisplayName("returns 200 'already enabled' when no change was made")
        void alreadyEnabled() {
            when(saasUserAccountService.enableMeteredBilling(SUPABASE_ID)).thenReturn(false);

            ResponseEntity<String> response = controller.enableMeteredBilling(SUPABASE_ID);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(response.getBody()).isEqualTo("User already has metered billing enabled");
        }

        @Test
        @DisplayName("maps IllegalArgumentException to 400 'Invalid request'")
        void illegalArgumentMapsTo400() {
            when(saasUserAccountService.enableMeteredBilling(SUPABASE_ID))
                    .thenThrow(new IllegalArgumentException("Invalid Supabase ID format"));

            ResponseEntity<String> response = controller.enableMeteredBilling(SUPABASE_ID);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(response.getBody()).isEqualTo("Invalid request");
        }

        @Test
        @DisplayName("maps any other exception to 500 'Error processing webhook'")
        void unexpectedExceptionMapsTo500() {
            when(saasUserAccountService.enableMeteredBilling(SUPABASE_ID))
                    .thenThrow(new RuntimeException("stripe down"));

            ResponseEntity<String> response = controller.enableMeteredBilling(SUPABASE_ID);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
            assertThat(response.getBody()).isEqualTo("Error processing webhook");
        }
    }

    @Nested
    @DisplayName("POST /disable-metered-billing")
    class DisableMeteredBilling {

        @Test
        @DisplayName("returns 200 'disabled' when metered billing is newly turned off")
        void disabled() {
            when(saasUserAccountService.disableMeteredBilling(SUPABASE_ID)).thenReturn(true);

            ResponseEntity<String> response = controller.disableMeteredBilling(SUPABASE_ID);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(response.getBody()).isEqualTo("Metered billing disabled successfully");
            verify(saasUserAccountService).disableMeteredBilling(SUPABASE_ID);
        }

        @Test
        @DisplayName("returns 200 'does not have' when no change was made")
        void notEnabled() {
            when(saasUserAccountService.disableMeteredBilling(SUPABASE_ID)).thenReturn(false);

            ResponseEntity<String> response = controller.disableMeteredBilling(SUPABASE_ID);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(response.getBody()).isEqualTo("User does not have metered billing enabled");
        }

        @Test
        @DisplayName("maps IllegalArgumentException to 400 'Invalid request'")
        void illegalArgumentMapsTo400() {
            when(saasUserAccountService.disableMeteredBilling(SUPABASE_ID))
                    .thenThrow(new IllegalArgumentException("User not found for Supabase ID"));

            ResponseEntity<String> response = controller.disableMeteredBilling(SUPABASE_ID);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(response.getBody()).isEqualTo("Invalid request");
        }

        @Test
        @DisplayName("maps any other exception to 500 'Error processing webhook'")
        void unexpectedExceptionMapsTo500() {
            when(saasUserAccountService.disableMeteredBilling(SUPABASE_ID))
                    .thenThrow(new RuntimeException("kaboom"));

            ResponseEntity<String> response = controller.disableMeteredBilling(SUPABASE_ID);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
            assertThat(response.getBody()).isEqualTo("Error processing webhook");
        }
    }

    @Nested
    @DisplayName("POST /promptToAuthUser")
    class PromptToAuthUser {

        private static final String USERNAME = "anon-user";
        private static final UUID LINKED_SUPABASE_ID =
                UUID.fromString("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");

        private Principal principal(String name) {
            Principal p = org.mockito.Mockito.mock(Principal.class);
            when(p.getName()).thenReturn(name);
            return p;
        }

        private User anonymousUser(UUID supabaseId) {
            User user = new User();
            user.setUsername(USERNAME);
            user.setSupabaseId(supabaseId);
            user.setAuthenticationType(AuthenticationType.ANONYMOUS);
            return user;
        }

        private SupabaseUser supabaseUserWithEmail(String email) {
            SupabaseUser su = new SupabaseUser();
            su.setId(LINKED_SUPABASE_ID);
            su.setEmail(email);
            su.setAnonymous(true);
            return su;
        }

        @Test
        @DisplayName("happy path: synchronizes upgrade and returns 200 with userId/email body")
        void happyPath() {
            User current = anonymousUser(LINKED_SUPABASE_ID);
            when(userService.findByUsername(USERNAME)).thenReturn(Optional.of(current));

            SupabaseUser supabaseUser = supabaseUserWithEmail("new@stirling.com");
            when(supabaseUserService.getUser(LINKED_SUPABASE_ID)).thenReturn(supabaseUser);

            User upgraded = new User();
            upgraded.setId(42L);
            upgraded.setEmail("new@stirling.com");
            upgraded.setUsername("new@stirling.com");
            when(saasUserAccountService.synchronizeUserUpgrade(
                            supabaseUser, "new@stirling.com", "google"))
                    .thenReturn(upgraded);

            ResponseEntity<Map<String, String>> response =
                    controller.promptToAuthUser("google", principal(USERNAME));

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(response.getBody())
                    .containsEntry("message", "User upgrade synchronized successfully")
                    .containsEntry("userId", "42")
                    .containsEntry("email", "new@stirling.com");
        }

        @Test
        @DisplayName("normalizes auth method to lowercase/trimmed before delegating")
        void normalizesAuthMethod() {
            User current = anonymousUser(LINKED_SUPABASE_ID);
            when(userService.findByUsername(USERNAME)).thenReturn(Optional.of(current));
            SupabaseUser supabaseUser = supabaseUserWithEmail("a@b.com");
            when(supabaseUserService.getUser(LINKED_SUPABASE_ID)).thenReturn(supabaseUser);

            User upgraded = new User();
            upgraded.setId(7L);
            upgraded.setEmail("a@b.com");
            when(saasUserAccountService.synchronizeUserUpgrade(any(), anyString(), anyString()))
                    .thenReturn(upgraded);

            ResponseEntity<Map<String, String>> response =
                    controller.promptToAuthUser("  GitHub  ", principal(USERNAME));

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            ArgumentCaptor<String> methodCaptor = ArgumentCaptor.forClass(String.class);
            verify(saasUserAccountService)
                    .synchronizeUserUpgrade(
                            eq(supabaseUser), eq("a@b.com"), methodCaptor.capture());
            assertThat(methodCaptor.getValue()).isEqualTo("github");
        }

        @Test
        @DisplayName("null authMethod is accepted and passed through as null")
        void nullAuthMethodAccepted() {
            User current = anonymousUser(LINKED_SUPABASE_ID);
            when(userService.findByUsername(USERNAME)).thenReturn(Optional.of(current));
            SupabaseUser supabaseUser = supabaseUserWithEmail("a@b.com");
            when(supabaseUserService.getUser(LINKED_SUPABASE_ID)).thenReturn(supabaseUser);

            User upgraded = new User();
            upgraded.setId(7L);
            upgraded.setEmail("a@b.com");
            when(saasUserAccountService.synchronizeUserUpgrade(
                            eq(supabaseUser), eq("a@b.com"), eq(null)))
                    .thenReturn(upgraded);

            ResponseEntity<Map<String, String>> response =
                    controller.promptToAuthUser(null, principal(USERNAME));

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            verify(saasUserAccountService).synchronizeUserUpgrade(supabaseUser, "a@b.com", null);
        }

        @Test
        @DisplayName("falls back to username in body when upgraded user has no email")
        void emailFallsBackToUsername() {
            User current = anonymousUser(LINKED_SUPABASE_ID);
            when(userService.findByUsername(USERNAME)).thenReturn(Optional.of(current));
            SupabaseUser supabaseUser = supabaseUserWithEmail("canon@b.com");
            when(supabaseUserService.getUser(LINKED_SUPABASE_ID)).thenReturn(supabaseUser);

            User upgraded = new User();
            upgraded.setId(9L);
            upgraded.setEmail(null);
            upgraded.setUsername("fallback-username");
            when(saasUserAccountService.synchronizeUserUpgrade(any(), anyString(), any()))
                    .thenReturn(upgraded);

            ResponseEntity<Map<String, String>> response =
                    controller.promptToAuthUser("email", principal(USERNAME));

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(response.getBody()).containsEntry("email", "fallback-username");
        }

        @Test
        @DisplayName("invalid auth method returns 400 without touching userService")
        void invalidAuthMethodRejected() {
            ResponseEntity<Map<String, String>> response =
                    controller.promptToAuthUser("myspace", principal(USERNAME));

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(response.getBody()).containsEntry("error", "Invalid authentication method");
            verifyNoInteractions(userService);
            verifyNoInteractions(saasUserAccountService);
        }

        @Test
        @DisplayName("unknown current user (IllegalStateException) maps to 404 'User not found'")
        void currentUserNotFound() {
            when(userService.findByUsername(USERNAME)).thenReturn(Optional.empty());

            ResponseEntity<Map<String, String>> response =
                    controller.promptToAuthUser("email", principal(USERNAME));

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
            assertThat(response.getBody()).containsEntry("error", "User not found");
            verify(saasUserAccountService, never()).synchronizeUserUpgrade(any(), any(), any());
        }

        @Test
        @DisplayName("current user without a linked Supabase ID returns 400")
        void noLinkedSupabaseId() {
            User current = anonymousUser(null);
            when(userService.findByUsername(USERNAME)).thenReturn(Optional.of(current));

            ResponseEntity<Map<String, String>> response =
                    controller.promptToAuthUser("email", principal(USERNAME));

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(response.getBody())
                    .containsEntry("error", "No Supabase account linked to current user");
            verifyNoInteractions(supabaseUserService);
        }

        @Test
        @DisplayName("non-anonymous user is rejected with 400")
        void nonAnonymousRejected() {
            User current = anonymousUser(LINKED_SUPABASE_ID);
            current.setAuthenticationType(AuthenticationType.WEB);
            when(userService.findByUsername(USERNAME)).thenReturn(Optional.of(current));
            when(supabaseUserService.getUser(LINKED_SUPABASE_ID))
                    .thenReturn(supabaseUserWithEmail("x@y.com"));

            ResponseEntity<Map<String, String>> response =
                    controller.promptToAuthUser("email", principal(USERNAME));

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(response.getBody())
                    .containsEntry("error", "Only anonymous users can be upgraded");
            verify(saasUserAccountService, never()).synchronizeUserUpgrade(any(), any(), any());
        }

        @Test
        @DisplayName("falls back to local user email when Supabase email is blank")
        void canonicalEmailFallsBackToLocal() {
            User current = anonymousUser(LINKED_SUPABASE_ID);
            current.setEmail("local@stirling.com");
            when(userService.findByUsername(USERNAME)).thenReturn(Optional.of(current));

            SupabaseUser supabaseUser = supabaseUserWithEmail("   "); // blank
            when(supabaseUserService.getUser(LINKED_SUPABASE_ID)).thenReturn(supabaseUser);

            User upgraded = new User();
            upgraded.setId(5L);
            upgraded.setEmail("local@stirling.com");
            when(saasUserAccountService.synchronizeUserUpgrade(
                            eq(supabaseUser), eq("local@stirling.com"), anyString()))
                    .thenReturn(upgraded);

            ResponseEntity<Map<String, String>> response =
                    controller.promptToAuthUser("email", principal(USERNAME));

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            verify(saasUserAccountService)
                    .synchronizeUserUpgrade(supabaseUser, "local@stirling.com", "email");
        }

        @Test
        @DisplayName("no email anywhere (Supabase and local both blank) returns 400")
        void noEmailAnywhere() {
            User current = anonymousUser(LINKED_SUPABASE_ID);
            current.setEmail(null);
            when(userService.findByUsername(USERNAME)).thenReturn(Optional.of(current));

            SupabaseUser supabaseUser = supabaseUserWithEmail(null);
            when(supabaseUserService.getUser(LINKED_SUPABASE_ID)).thenReturn(supabaseUser);

            ResponseEntity<Map<String, String>> response =
                    controller.promptToAuthUser("email", principal(USERNAME));

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(response.getBody())
                    .containsEntry("error", "No email associated with user account");
            verify(saasUserAccountService, never()).synchronizeUserUpgrade(any(), any(), any());
        }

        @Test
        @DisplayName("unexpected RuntimeException from sync maps to 500")
        void unexpectedExceptionMapsTo500() {
            User current = anonymousUser(LINKED_SUPABASE_ID);
            when(userService.findByUsername(USERNAME)).thenReturn(Optional.of(current));
            SupabaseUser supabaseUser = supabaseUserWithEmail("a@b.com");
            when(supabaseUserService.getUser(LINKED_SUPABASE_ID)).thenReturn(supabaseUser);
            when(saasUserAccountService.synchronizeUserUpgrade(any(), anyString(), any()))
                    .thenThrow(new RuntimeException("db down"));

            ResponseEntity<Map<String, String>> response =
                    controller.promptToAuthUser("email", principal(USERNAME));

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
            assertThat(response.getBody())
                    .containsEntry("error", "Failed to synchronize user upgrade");
        }

        @Test
        @DisplayName("getUser throwing (Supabase row missing) maps to 500")
        void supabaseUserMissingMapsTo500() {
            User current = anonymousUser(LINKED_SUPABASE_ID);
            when(userService.findByUsername(USERNAME)).thenReturn(Optional.of(current));
            when(supabaseUserService.getUser(LINKED_SUPABASE_ID))
                    .thenThrow(new RuntimeException("Supabase user not found"));

            ResponseEntity<Map<String, String>> response =
                    controller.promptToAuthUser("email", principal(USERNAME));

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
            assertThat(response.getBody())
                    .containsEntry("error", "Failed to synchronize user upgrade");
        }

        @Test
        @DisplayName("all allowed auth methods are accepted (none rejected as invalid)")
        void allowedAuthMethodsAccepted() {
            for (String method :
                    new String[] {
                        "email", "oauth", "google", "github", "apple", "azure", "linkedin_oidc"
                    }) {
                User current = anonymousUser(LINKED_SUPABASE_ID);
                when(userService.findByUsername(USERNAME)).thenReturn(Optional.of(current));
                SupabaseUser supabaseUser = supabaseUserWithEmail("a@b.com");
                when(supabaseUserService.getUser(LINKED_SUPABASE_ID)).thenReturn(supabaseUser);
                User upgraded = new User();
                upgraded.setId(1L);
                upgraded.setEmail("a@b.com");
                when(saasUserAccountService.synchronizeUserUpgrade(any(), anyString(), anyString()))
                        .thenReturn(upgraded);

                ResponseEntity<Map<String, String>> response =
                        controller.promptToAuthUser(method, principal(USERNAME));

                assertThat(response.getStatusCode())
                        .as("method %s should be accepted", method)
                        .isEqualTo(HttpStatus.OK);
            }
        }
    }
}
