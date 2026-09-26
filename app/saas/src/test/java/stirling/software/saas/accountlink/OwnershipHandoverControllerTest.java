package stirling.software.saas.accountlink;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.security.core.Authentication;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.saas.service.SaasOwnershipHandoverService;
import stirling.software.saas.util.AuthenticationUtils;

class OwnershipHandoverControllerTest {
    private final AccountLinkService links = mock(AccountLinkService.class);
    private final SaasOwnershipHandoverService handovers = mock(SaasOwnershipHandoverService.class);
    private final UserRepository users = mock(UserRepository.class);
    private final Authentication auth = mock(Authentication.class);
    private final OwnershipHandoverController controller =
            new OwnershipHandoverController(links, handovers, users);
    private final OwnershipHandoverController.Request request =
            new OwnershipHandoverController.Request("successor@example.com", 1L);

    @Test
    void candidateReadIsScopedToTheDeviceTeam() {
        controller.candidates(new LinkedInstanceAuthenticationToken(4L, 9L));
        verify(handovers).candidates(9L);
        verifyNoInteractions(links, users);
    }

    @Test
    void humanSessionCannotReadCandidatesThroughTheDeviceEndpoint() {
        assertEquals(
                403,
                assertThrows(ResponseStatusException.class, () -> controller.candidates(auth))
                        .getStatusCode()
                        .value());
        verifyNoInteractions(handovers, links, users);
    }

    @Test
    void humanSessionWithoutValidDeviceCredentialsCannotUseInstanceTransfer() {
        when(links.resolveActiveInstance("device", "wrong-secret")).thenReturn(Optional.empty());
        var error =
                assertThrows(
                        ResponseStatusException.class,
                        () ->
                                controller.change(
                                        "transfer", "device", "wrong-secret", request, auth));
        assertEquals(403, error.getStatusCode().value());
        verifyNoInteractions(handovers, users);
    }

    @Test
    void authenticatedDeviceSuppliesTeamAndStillRequiresTheHumanOwner() {
        LinkedInstance instance = new LinkedInstance();
        instance.setTeamId(9L);
        User owner = new User();
        owner.setId(1L);
        when(links.resolveActiveInstance("device", "secret")).thenReturn(Optional.of(instance));
        try (var authentication = mockStatic(AuthenticationUtils.class)) {
            authentication
                    .when(() -> AuthenticationUtils.getCurrentUser(auth, users))
                    .thenReturn(owner);
            controller.change("transfer", "device", "secret", request, auth);
        }
        verify(handovers)
                .changeFromInstance(instance, "successor@example.com", 1L, owner, "transfer", null);
        verify(handovers, never()).change(anyLong(), anyString(), anyLong(), any(), anyString());
    }
}
