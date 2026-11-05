package stirling.software.saas.payg.cancellation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;

import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.saas.security.UserTeamResolver;
import stirling.software.saas.util.AuthenticationUtils;

class SubscriptionCancellationControllerTest {

    private final SubscriptionCancellationService service =
            mock(SubscriptionCancellationService.class);
    private final UserRepository users = mock(UserRepository.class);
    private final UserTeamResolver teams = mock(UserTeamResolver.class);
    private final SubscriptionCancellationController controller =
            new SubscriptionCancellationController(service, users, teams);

    @Test
    void onlyABillingLeaderOfATeamGetsIn() {
        User member = new User();
        Authentication auth = mock(Authentication.class);
        try (var utils = org.mockito.Mockito.mockStatic(AuthenticationUtils.class)) {
            utils.when(() -> AuthenticationUtils.getCurrentUser(any(), any())).thenReturn(member);
            when(teams.teamId(member)).thenReturn(Optional.of(42L));
            when(teams.isLeader(member)).thenReturn(false);

            assertThatThrownBy(() -> controller.status(auth))
                    .extracting(e -> ((CancellationException) e).status())
                    .isEqualTo(HttpStatus.FORBIDDEN);
            verifyNoInteractions(service);

            when(teams.isLeader(member)).thenReturn(true);
            when(service.status(42L)).thenReturn(List.of());
            assertThat(controller.status(auth)).containsKey("subscriptions");
        }
    }

    @Test
    void refusalsBecomeTheirStatusWithACode() {
        var response =
                controller.refused(
                        new CancellationException(HttpStatus.TOO_MANY_REQUESTS, "contact_limit"));
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
        assertThat(response.getBody()).containsEntry("error", "contact_limit");
    }
}
