package stirling.software.saas.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.HashMap;
import java.util.Map;

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
import stirling.software.saas.config.CreditsProperties;

/**
 * Unit tests for {@link UserRoleService}.
 *
 * <p>The service is a thin orchestrator: it flips a user's {@link Authority} row, mirrors the role
 * into the denormalized {@code roleName} column, and (for the upgrade/downgrade helpers) resets the
 * cycle credit allocation via {@link CreditService}. All collaborators are mocked; allocation math
 * is pure arithmetic and asserted exactly.
 *
 * <p>Allocation note: {@link CreditsProperties}'s default map already carries ROLE_USER=50 and
 * ROLE_PRO_USER=500, so {@code getOrDefault} returns those, NOT the inline 25/100 fallbacks baked
 * into the service. The inline fallbacks only surface when the allocations map lacks the key, which
 * is exercised separately with an emptied map.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class UserRoleServiceTest {

    @Mock private UserRepository userRepository;
    @Mock private AuthorityRepository authorityRepository;
    @Mock private CreditService creditService;

    private static final String ROLE_USER = Role.USER.getRoleId(); // "ROLE_USER"
    private static final String ROLE_PRO_USER = Role.PRO_USER.getRoleId(); // "ROLE_PRO_USER"

    /** Build the service with the supplied properties (allocations differ per test). */
    private UserRoleService service(CreditsProperties props) {
        return new UserRoleService(userRepository, authorityRepository, creditService, props);
    }

    /** Default properties: allocations map carries ROLE_USER=50, ROLE_PRO_USER=500. */
    private static CreditsProperties defaultProps() {
        return new CreditsProperties();
    }

    /** Properties whose allocations map is empty, forcing the service's inline 25/100 fallbacks. */
    private static CreditsProperties emptyAllocationsProps() {
        CreditsProperties p = new CreditsProperties();
        p.getCycle().setAllocations(new HashMap<>());
        return p;
    }

    /** Properties whose allocations map holds the exact values we want to assert against. */
    private static CreditsProperties propsWith(Map<String, Integer> allocations) {
        CreditsProperties p = new CreditsProperties();
        p.getCycle().setAllocations(new HashMap<>(allocations));
        return p;
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
            UserRoleService service = service(defaultProps());
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
            // No credit reset on the bare changeRole path.
            verify(creditService, never())
                    .resetCycleAllocationForRoleChange(Mockito.anyLong(), Mockito.anyInt());
        }

        @Test
        @DisplayName("persists the authority before the user (authority-first ordering)")
        void persistsAuthorityBeforeUser() {
            UserRoleService service = service(defaultProps());
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
            UserRoleService service = service(defaultProps());
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
            UserRoleService service = service(defaultProps());
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
            UserRoleService service = service(defaultProps());
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
        @DisplayName("sets ROLE_USER and resets credits to the configured FREE allocation (50)")
        void setsUserRoleAndResetsCreditsFromConfig() {
            UserRoleService service = service(defaultProps());
            User u = user(42L, "eve@example.com", ROLE_PRO_USER);
            Authority auth = authority(ROLE_PRO_USER);
            when(authorityRepository.findByUserId(42L)).thenReturn(auth);

            service.downgradeToFree(u);

            assertThat(auth.getAuthority()).isEqualTo(ROLE_USER);
            assertThat(mirroredRoleName(u)).isEqualTo(ROLE_USER);
            verify(authorityRepository).save(auth);
            verify(userRepository).save(u);
            // Config map has ROLE_USER=50, so getOrDefault returns 50 (NOT the inline 25 fallback).
            verify(creditService).resetCycleAllocationForRoleChange(42L, 50);
        }

        @Test
        @DisplayName("uses the inline 25 fallback when the allocations map omits ROLE_USER")
        void usesInlineFallbackWhenAllocationMissing() {
            UserRoleService service = service(emptyAllocationsProps());
            User u = user(42L, "frank@example.com", ROLE_PRO_USER);
            Authority auth = authority(ROLE_PRO_USER);
            when(authorityRepository.findByUserId(42L)).thenReturn(auth);

            service.downgradeToFree(u);

            verify(creditService).resetCycleAllocationForRoleChange(42L, 25);
        }

        @Test
        @DisplayName("honours an explicit ROLE_USER allocation override")
        void honoursExplicitAllocationOverride() {
            UserRoleService service = service(propsWith(Map.of(ROLE_USER, 7)));
            User u = user(42L, "grace@example.com", ROLE_PRO_USER);
            Authority auth = authority(ROLE_PRO_USER);
            when(authorityRepository.findByUserId(42L)).thenReturn(auth);

            service.downgradeToFree(u);

            verify(creditService).resetCycleAllocationForRoleChange(42L, 7);
        }

        @Test
        @DisplayName("changes the role before resetting credits (role flip precedes the reset)")
        void changesRoleBeforeResettingCredits() {
            UserRoleService service = service(defaultProps());
            User u = user(42L, "heidi@example.com", ROLE_PRO_USER);
            Authority auth = authority(ROLE_PRO_USER);
            when(authorityRepository.findByUserId(42L)).thenReturn(auth);

            service.downgradeToFree(u);

            InOrder order = Mockito.inOrder(userRepository, creditService);
            order.verify(userRepository).save(u);
            order.verify(creditService).resetCycleAllocationForRoleChange(42L, 50);
        }
    }

    @Nested
    @DisplayName("upgradeToPro")
    class UpgradeToPro {

        @Test
        @DisplayName("sets ROLE_PRO_USER and resets credits to the configured PRO allocation (500)")
        void setsProRoleAndResetsCreditsFromConfig() {
            UserRoleService service = service(defaultProps());
            User u = user(42L, "ivan@example.com", ROLE_USER);
            Authority auth = authority(ROLE_USER);
            when(authorityRepository.findByUserId(42L)).thenReturn(auth);

            service.upgradeToPro(u);

            assertThat(auth.getAuthority()).isEqualTo(ROLE_PRO_USER);
            assertThat(mirroredRoleName(u)).isEqualTo(ROLE_PRO_USER);
            verify(authorityRepository).save(auth);
            verify(userRepository).save(u);
            // Config map has ROLE_PRO_USER=500, so getOrDefault returns 500 (NOT inline 100).
            verify(creditService).resetCycleAllocationForRoleChange(42L, 500);
        }

        @Test
        @DisplayName("uses the inline 100 fallback when the allocations map omits ROLE_PRO_USER")
        void usesInlineFallbackWhenAllocationMissing() {
            UserRoleService service = service(emptyAllocationsProps());
            User u = user(42L, "judy@example.com", ROLE_USER);
            Authority auth = authority(ROLE_USER);
            when(authorityRepository.findByUserId(42L)).thenReturn(auth);

            service.upgradeToPro(u);

            verify(creditService).resetCycleAllocationForRoleChange(42L, 100);
        }

        @Test
        @DisplayName("honours an explicit ROLE_PRO_USER allocation override")
        void honoursExplicitAllocationOverride() {
            UserRoleService service = service(propsWith(Map.of(ROLE_PRO_USER, 9999)));
            User u = user(42L, "mallory@example.com", ROLE_USER);
            Authority auth = authority(ROLE_USER);
            when(authorityRepository.findByUserId(42L)).thenReturn(auth);

            service.upgradeToPro(u);

            verify(creditService).resetCycleAllocationForRoleChange(42L, 9999);
        }

        @Test
        @DisplayName("changes the role before resetting credits (role flip precedes the reset)")
        void changesRoleBeforeResettingCredits() {
            UserRoleService service = service(defaultProps());
            User u = user(42L, "niaj@example.com", ROLE_USER);
            Authority auth = authority(ROLE_USER);
            when(authorityRepository.findByUserId(42L)).thenReturn(auth);

            service.upgradeToPro(u);

            InOrder order = Mockito.inOrder(userRepository, creditService);
            order.verify(userRepository).save(u);
            order.verify(creditService).resetCycleAllocationForRoleChange(42L, 500);
        }
    }

    @Nested
    @DisplayName("getCreditAllocationForRole")
    class GetCreditAllocationForRole {

        @Test
        @DisplayName("returns the configured allocation when the role is present in the map")
        void returnsConfiguredAllocation() {
            UserRoleService service = service(defaultProps());

            // Default map: ROLE_USER=50, ROLE_PRO_USER=500, ROLE_ADMIN=1000.
            assertThat(service.getCreditAllocationForRole(ROLE_USER)).isEqualTo(50);
            assertThat(service.getCreditAllocationForRole(ROLE_PRO_USER)).isEqualTo(500);
            assertThat(service.getCreditAllocationForRole("ROLE_ADMIN")).isEqualTo(1000);
        }

        @Test
        @DisplayName("ROLE_USER falls back to 25 when missing from the allocations map")
        void userRoleFallsBackTo25() {
            UserRoleService service = service(emptyAllocationsProps());

            assertThat(service.getCreditAllocationForRole(ROLE_USER)).isEqualTo(25);
        }

        @Test
        @DisplayName("any non-ROLE_USER role falls back to 100 when missing from the map")
        void nonUserRoleFallsBackTo100() {
            UserRoleService service = service(emptyAllocationsProps());

            assertThat(service.getCreditAllocationForRole(ROLE_PRO_USER)).isEqualTo(100);
            assertThat(service.getCreditAllocationForRole("ROLE_ADMIN")).isEqualTo(100);
            assertThat(service.getCreditAllocationForRole("ROLE_UNKNOWN")).isEqualTo(100);
        }

        @Test
        @DisplayName("null role id is treated as non-ROLE_USER and falls back to 100")
        void nullRoleIdFallsBackTo100() {
            UserRoleService service = service(emptyAllocationsProps());

            // getOrDefault(null, ...) misses (no null key); the ternary's equals(null) is false
            // -> 100. Must not NPE because Role.USER.getRoleId().equals(roleId) is null-safe.
            assertThat(service.getCreditAllocationForRole(null)).isEqualTo(100);
        }

        @Test
        @DisplayName("a configured value of zero is returned verbatim, not replaced by a fallback")
        void zeroAllocationReturnedVerbatim() {
            UserRoleService service = service(propsWith(Map.of("ROLE_WEB_ONLY_USER", 0)));

            assertThat(service.getCreditAllocationForRole("ROLE_WEB_ONLY_USER")).isZero();
        }

        @Test
        @DisplayName("getCreditAllocationForRole never touches the persistence collaborators")
        void doesNotTouchRepositories() {
            UserRoleService service = service(defaultProps());

            service.getCreditAllocationForRole(ROLE_USER);

            Mockito.verifyNoInteractions(userRepository, authorityRepository, creditService);
        }
    }
}
