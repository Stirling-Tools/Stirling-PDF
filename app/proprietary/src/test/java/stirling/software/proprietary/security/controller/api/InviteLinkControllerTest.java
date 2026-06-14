package stirling.software.proprietary.security.controller.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.security.Principal;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import jakarta.enterprise.inject.Instance;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.SecurityContext;
import jakarta.ws.rs.core.UriInfo;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.enumeration.Role;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.model.InviteToken;
import stirling.software.proprietary.security.repository.InviteTokenRepository;
import stirling.software.proprietary.security.repository.TeamRepository;
import stirling.software.proprietary.security.service.EmailService;
import stirling.software.proprietary.security.service.TeamService;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.service.UserLicenseSettingsService;

/**
 * Migration (Spring MockMvc -> direct JAX-RS calls): {@code InviteLinkController} now returns
 * {@code jakarta.ws.rs.core.Response}, reads the admin caller from an injected JAX-RS {@code
 * SecurityContext} (was a Spring {@code Principal} parameter), persists via the Panache repository
 * ({@code persist(...)} replaces {@code save(...)}) and resolves the optional {@code EmailService}
 * through a CDI {@code Instance}. The controller has no constructor (field injection only), so the
 * collaborators are assigned directly. Each test invokes the endpoint and asserts the status /
 * entity map.
 */
@ExtendWith(MockitoExtension.class)
class InviteLinkControllerTest {

    @Mock private InviteTokenRepository inviteTokenRepository;
    @Mock private TeamRepository teamRepository;
    @Mock private UserService userService;
    @Mock private EmailService emailService;
    @Mock private UserLicenseSettingsService userLicenseSettingsService;

    private ApplicationProperties applicationProperties;
    private InviteLinkController controller;
    private SecurityContext adminSecurityContext;
    private UriInfo uriInfo;

    @BeforeEach
    void setUp() {
        applicationProperties = new ApplicationProperties();
        applicationProperties.getMail().setEnableInvites(true);
        applicationProperties.getMail().setInviteLinkExpiryHours(24);
        applicationProperties.getSystem().setFrontendUrl("https://frontend.example.com");

        controller = new InviteLinkController();
        // @Inject fields are not populated without a CDI container; wire them directly.
        controller.inviteTokenRepository = inviteTokenRepository;
        controller.teamRepository = teamRepository;
        controller.userService = userService;
        controller.applicationProperties = applicationProperties;
        controller.emailService = emailServiceInstance();
        controller.userLicenseSettingsService = userLicenseSettingsService;

        Principal adminPrincipal = () -> "admin";
        adminSecurityContext = mock(SecurityContext.class);
        lenient().when(adminSecurityContext.getUserPrincipal()).thenReturn(adminPrincipal);
        // No configured-URL fallback is taken in these tests (frontendUrl is always set), so
        // UriInfo
        // is never read; a bare mock satisfies the @Context parameter.
        uriInfo = mock(UriInfo.class);
    }

    @SuppressWarnings("unchecked")
    private Instance<EmailService> emailServiceInstance() {
        Instance<EmailService> instance = mock(Instance.class);
        lenient().when(instance.isResolvable()).thenReturn(true);
        lenient().when(instance.get()).thenReturn(emailService);
        return instance;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> body(Response response) {
        return (Map<String, Object>) response.getEntity();
    }

    private Response generate(String email) {
        return controller.generateInviteLink(
                email, null, null, null, null, null, adminSecurityContext, uriInfo);
    }

    @Test
    void generateInviteLinkRejectsWhenInvitesDisabled() {
        applicationProperties.getMail().setEnableInvites(false);

        Response response = generate(null);

        assertEquals(Response.Status.BAD_REQUEST.getStatusCode(), response.getStatus());
        assertEquals("Email invites are not enabled", body(response).get("error"));

        verify(inviteTokenRepository, never()).persist(any(InviteToken.class));
    }

    @Test
    void generateInviteLinkRejectsInvalidEmail() {
        applicationProperties.getMail().setEnableInvites(true);

        Response response = generate("not-an-email");

        assertEquals(Response.Status.BAD_REQUEST.getStatusCode(), response.getStatus());
        assertEquals("Invalid email address", body(response).get("error"));
    }

    @Test
    void generateInviteLinkBlocksOnLicenseLimit() {
        applicationProperties.getPremium().setEnabled(true);
        when(userService.getTotalUsersCount()).thenReturn(1L);
        when(inviteTokenRepository.countActiveInvites(any(LocalDateTime.class))).thenReturn(0L);
        when(userLicenseSettingsService.calculateMaxAllowedUsers()).thenReturn(1);

        Response response = generate("new@ex.com");

        assertEquals(Response.Status.BAD_REQUEST.getStatusCode(), response.getStatus());
        assertThat((String) body(response).get("error")).startsWith("License limit reached");
    }

    @Test
    void generateInviteLinkAllowedOnServerLicense() {
        // SERVER license has raw maxUsers=0, but calculateMaxAllowedUsers() returns
        // Integer.MAX_VALUE
        applicationProperties.getPremium().setEnabled(true);
        when(userService.getTotalUsersCount()).thenReturn(3L);
        when(inviteTokenRepository.countActiveInvites(any(LocalDateTime.class))).thenReturn(0L);
        when(userLicenseSettingsService.calculateMaxAllowedUsers()).thenReturn(Integer.MAX_VALUE);
        when(userService.usernameExistsIgnoreCase("new@ex.com")).thenReturn(false);
        when(inviteTokenRepository.findByEmail("new@ex.com")).thenReturn(Optional.empty());
        Team defaultTeam = new Team();
        defaultTeam.setId(1L);
        defaultTeam.setName(TeamService.DEFAULT_TEAM_NAME);
        when(teamRepository.findByName(TeamService.DEFAULT_TEAM_NAME))
                .thenReturn(Optional.of(defaultTeam));

        Response response = generate("new@ex.com");

        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
    }

    @Test
    void generateInviteLinkBuildsFrontendUrl() {
        Team defaultTeam = new Team();
        defaultTeam.setId(5L);
        defaultTeam.setName(TeamService.DEFAULT_TEAM_NAME);
        when(teamRepository.findByName(TeamService.DEFAULT_TEAM_NAME))
                .thenReturn(Optional.of(defaultTeam));
        when(userService.usernameExistsIgnoreCase("new@example.com")).thenReturn(false);
        when(inviteTokenRepository.findByEmail("new@example.com")).thenReturn(Optional.empty());

        Response response = generate("new@example.com");

        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
        assertThat((String) body(response).get("inviteUrl"))
                .startsWith("https://frontend.example.com/invite/");
        assertEquals("new@example.com", body(response).get("email"));

        verify(inviteTokenRepository).persist(any(InviteToken.class));
    }

    @Test
    void validateInviteTokenReturnsNotFoundWhenExpired() {
        InviteToken expired = new InviteToken();
        expired.setToken("abc");
        expired.setExpiresAt(LocalDateTime.now().minusHours(1));
        expired.setRole(Role.USER.getRoleId());
        when(inviteTokenRepository.findByToken("abc")).thenReturn(Optional.of(expired));

        Response response = controller.validateInviteToken("abc");

        assertEquals(Response.Status.NOT_FOUND.getStatusCode(), response.getStatus());
        assertEquals("Invalid invite link", body(response).get("error"));
    }

    @Test
    void acceptInviteCreatesUserWhenEmailProvided() throws Exception {
        InviteToken invite = new InviteToken();
        invite.setToken("abc");
        invite.setExpiresAt(LocalDateTime.now().plusHours(2));
        invite.setRole(Role.USER.getRoleId());
        invite.setUsed(false);
        invite.setEmail(null); // email required from request
        when(inviteTokenRepository.findByToken("abc")).thenReturn(Optional.of(invite));
        when(userService.usernameExistsIgnoreCase("new@example.com")).thenReturn(false);

        Response response = controller.acceptInvite("abc", "new@example.com", "password123");

        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
        assertEquals("Account created successfully", body(response).get("message"));
        assertEquals("new@example.com", body(response).get("username"));

        verify(userService).saveUserCore(any());
        verify(inviteTokenRepository).persist(invite);
    }
}
