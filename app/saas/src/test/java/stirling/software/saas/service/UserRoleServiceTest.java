package stirling.software.saas.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.test.util.ReflectionTestUtils;

import stirling.software.common.model.enumeration.Role;
import stirling.software.proprietary.security.database.repository.AuthorityRepository;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.Authority;
import stirling.software.proprietary.security.model.User;

/**
 * Unit tests for {@link UserRoleService}.
 *
 * <p>The service is a thin orchestrator: it flips a user's {@link Authority} row and mirrors the
 * role into the denormalized {@code roleName} column. All collaborators are mocked.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class UserRoleServiceTest {

    @Mock private UserRepository userRepository;
    @Mock private AuthorityRepository authorityRepository;

    private static final String ROLE_USER = Role.USER.getRoleId(); // "ROLE_USER"
    private static final String ROLE_PRO_USER = Role.PRO_USER.getRoleId(); // "ROLE_PRO_USER"

    private UserRoleService service() {
        return new UserRoleService(userRepository, authorityRepository);
    }

    private static User user(long id, String username, String currentRole) {
        User u = new User();
        u.setId(id);
        u.setUsername(username);
        u.setRoleName(currentRole);
        return u;
    }

    private static Authority authority(String currentRole) {
        Authority a = new Authority();
        a.setId(7L);
        a.setAuthority(currentRole);
        return a;
    }

    /**
     * Reads the denormalized {@code roleName} column straight off the field. {@link
     * User#getRoleName()} is overridden to derive the role from the authorities set (via {@link
     * Role#fromString}), so it cannot observe the column that {@code changeRole} mirrors via {@code
     * setRoleName}.
     */
    private static String mirroredRoleName(User u) {
        return (String) ReflectionTestUtils.getField(u, "roleName");
    }

    @Nested
    @DisplayName("changeRole")
    class ChangeRole {

        @Test
        @DisplayName("flips the Authority row, mirrors roleName, and persists both")
        void flipsAuthorityAndMirrorsRoleName() {
            UserRoleService service = service();
            User u = user(42L, "alice@example.com", ROLE_USER);
            Authority auth = authority(ROLE_USER);
            when(authorityRepository.findByUserId(42L)).thenReturn(auth);

            service.changeRole(u, ROLE_PRO_USER);

            // Authority entity carries the new role and is saved.
            assertThat(auth.getAuthority()).isEqualTo(ROLE_PRO_USER);
            verify(authorityRepository).save(auth);
            // Denormalized column mirrored on the User entity and saved.
            assertThat(mirroredRoleName(u)).isEqualTo(ROLE_PRO_USER);
            verify(userRepository).save(u);
        }

        @Test
        @DisplayName("persists the authority before the user (authority-first ordering)")
        void persistsAuthorityBeforeUser() {
            UserRoleService service = service();
            User u = user(42L, "alice@example.com", ROLE_USER);
            Authority auth = authority(ROLE_USER);
            when(authorityRepository.findByUserId(42L)).thenReturn(auth);

            service.changeRole(u, ROLE_PRO_USER);

            InOrder order = Mockito.inOrder(authorityRepository, userRepository);
            order.verify(authorityRepository).save(auth);
            order.verify(userRepository).save(u);
        }

        @Test
        @DisplayName("looks the authority up by the user's numeric id")
        void looksUpAuthorityByUserId() {
            UserRoleService service = service();
            User u = user(99L, "bob@example.com", ROLE_PRO_USER);
            Authority auth = authority(ROLE_PRO_USER);
            when(authorityRepository.findByUserId(99L)).thenReturn(auth);

            service.changeRole(u, ROLE_USER);

            verify(authorityRepository).findByUserId(99L);
            assertThat(auth.getAuthority()).isEqualTo(ROLE_USER);
            assertThat(mirroredRoleName(u)).isEqualTo(ROLE_USER);
        }

        @Test
        @DisplayName("setting the same role is a harmless no-op rewrite that still persists")
        void sameRoleStillPersists() {
            UserRoleService service = service();
            User u = user(42L, "carol@example.com", ROLE_USER);
            Authority auth = authority(ROLE_USER);
            when(authorityRepository.findByUserId(42L)).thenReturn(auth);

            service.changeRole(u, ROLE_USER);

            assertThat(auth.getAuthority()).isEqualTo(ROLE_USER);
            verify(authorityRepository).save(auth);
            verify(userRepository).save(u);
        }

        @Test
        @DisplayName("tolerates an empty authorities set on the User (logging reads roles as \"\")")
        void emptyAuthoritiesSetIsTolerated() {
            UserRoleService service = service();
            User u = user(42L, "dave@example.com", null);
            // getRolesAsString() joins an empty set -> "" ; must not NPE in the debug log.
            Authority auth = authority(null);
            when(authorityRepository.findByUserId(42L)).thenReturn(auth);

            service.changeRole(u, ROLE_PRO_USER);

            assertThat(auth.getAuthority()).isEqualTo(ROLE_PRO_USER);
            assertThat(mirroredRoleName(u)).isEqualTo(ROLE_PRO_USER);
        }
    }

    @Nested
    @DisplayName("downgradeToFree")
    class DowngradeToFree {

        @Test
        @DisplayName("sets ROLE_USER, mirrors roleName, and persists both")
        void setsUserRole() {
            UserRoleService service = service();
            User u = user(42L, "eve@example.com", ROLE_PRO_USER);
            Authority auth = authority(ROLE_PRO_USER);
            when(authorityRepository.findByUserId(42L)).thenReturn(auth);

            service.downgradeToFree(u);

            assertThat(auth.getAuthority()).isEqualTo(ROLE_USER);
            assertThat(mirroredRoleName(u)).isEqualTo(ROLE_USER);
            verify(authorityRepository).save(auth);
            verify(userRepository).save(u);
        }
    }

    @Nested
    @DisplayName("upgradeToPro")
    class UpgradeToPro {

        @Test
        @DisplayName("sets ROLE_PRO_USER, mirrors roleName, and persists both")
        void setsProRole() {
            UserRoleService service = service();
            User u = user(42L, "ivan@example.com", ROLE_USER);
            Authority auth = authority(ROLE_USER);
            when(authorityRepository.findByUserId(42L)).thenReturn(auth);

            service.upgradeToPro(u);

            assertThat(auth.getAuthority()).isEqualTo(ROLE_PRO_USER);
            assertThat(mirroredRoleName(u)).isEqualTo(ROLE_PRO_USER);
            verify(authorityRepository).save(auth);
            verify(userRepository).save(u);
        }
    }
}
