package stirling.software.proprietary.model;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.proprietary.security.model.User;

@ExtendWith(MockitoExtension.class)
class TeamTest {

    @Test
    void users_isInitializedAndEmpty() {
        Team team = new Team();
        assertNotNull(team.getUsers(), "users Set should be initialized");
        assertTrue(team.getUsers().isEmpty(), "users Set should start empty");
    }

    @Test
    void addUser_addsToSet_and_setsBackReference() {
        Team team = new Team();
        User user = mock(User.class);

        team.addUser(user);

        assertTrue(team.getUsers().contains(user), "Team should contain added user");
        verify(user, times(1)).setTeam(team);
        verifyNoMoreInteractions(user);
    }

    @Test
    void addUser_twice_isIdempotent_dueToSetSemantics() {
        Team team = new Team();
        User user = mock(User.class);

        team.addUser(user);
        team.addUser(user);

        assertEquals(1, team.getUsers().size(), "Adding same user twice should not duplicate");
        // In our code, setTeam is called twice (we only test Set idempotency)
        verify(user, times(2)).setTeam(team);
    }

    @Test
    void removeUser_removesFromSet_and_clearsBackReference() {
        Team team = new Team();
        User user = mock(User.class);

        team.addUser(user);
        assertTrue(team.getUsers().contains(user));

        team.removeUser(user);

        assertFalse(team.getUsers().contains(user), "User should be removed from Team");
        verify(user, times(1)).setTeam(null);
    }

    @Test
    void removeUser_onUserNotInSet_still_clearsBackReference() {
        Team team = new Team();
        User stranger = mock(User.class);

        // not added
        team.removeUser(stranger);

        // Set remains empty
        assertTrue(team.getUsers().isEmpty());
        // Back-reference is still set to null
        verify(stranger, times(1)).setTeam(null);
    }
}
