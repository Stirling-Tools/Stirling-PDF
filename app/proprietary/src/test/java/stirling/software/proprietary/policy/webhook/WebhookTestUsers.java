package stirling.software.proprietary.policy.webhook;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.Optional;

import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;

/** A {@link UserService} that knows one owner, the shape every webhook test needs. */
final class WebhookTestUsers {

    static final String OWNER = "owner";

    private WebhookTestUsers() {}

    static User owner() {
        Team team = new Team();
        team.setId(7L);
        User user = new User();
        user.setId(1L);
        user.setUsername(OWNER);
        user.setTeam(team);
        return user;
    }

    static UserService knowingOnly(User user) {
        UserService users = mock(UserService.class);
        when(users.findByUsername(anyString())).thenReturn(Optional.empty());
        when(users.findByUsername(user.getUsername())).thenReturn(Optional.of(user));
        return users;
    }
}
