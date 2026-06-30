package stirling.software.saas.payg.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;

import stirling.software.common.model.enumeration.TeamRole;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.saas.model.TeamMembership;
import stirling.software.saas.payg.api.PaygPaymentMethodController.PaymentMethodResponse;
import stirling.software.saas.payg.policy.PaygTeamExtensions;
import stirling.software.saas.payg.repository.PaygTeamExtensionsRepository;
import stirling.software.saas.payg.stripe.StripePaymentMethodDao;
import stirling.software.saas.payg.stripe.StripePaymentMethodDao.CardSummary;
import stirling.software.saas.repository.TeamMembershipRepository;
import stirling.software.saas.security.EnhancedJwtAuthenticationToken;

/**
 * Pure-Mockito unit tests for {@link PaygPaymentMethodController}: the auth/team-resolution and
 * defensive-degrade branches, plus the happy path mapping a DAO {@link CardSummary} to the trimmed
 * response.
 */
@ExtendWith(MockitoExtension.class)
class PaygPaymentMethodControllerTest {

    @Mock private StripePaymentMethodDao paymentMethodDao;
    @Mock private PaygTeamExtensionsRepository extRepo;
    @Mock private TeamMembershipRepository memberRepo;
    @Mock private UserRepository userRepository;

    private PaygPaymentMethodController controller;

    @BeforeEach
    void setUp() {
        controller =
                new PaygPaymentMethodController(
                        paymentMethodDao, extRepo, memberRepo, userRepository);
    }

    @Test
    void anonymousIsRejected() {
        Authentication anon =
                new AnonymousAuthenticationToken(
                        "k",
                        "anonymousUser",
                        List.of(new SimpleGrantedAuthority("ROLE_ANONYMOUS")));

        ResponseEntity<PaymentMethodResponse> resp = controller.get(anon);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        verifyNoInteractions(paymentMethodDao, extRepo, memberRepo);
    }

    @Test
    void noTeam_returnsAbsent() {
        User user = userWithId(5L, UUID.randomUUID());
        when(userRepository.findBySupabaseId(any())).thenReturn(Optional.of(user));
        when(memberRepo.findPrimaryMembership(5L)).thenReturn(List.of());

        ResponseEntity<PaymentMethodResponse> resp = controller.get(jwtAuth(user.getSupabaseId()));

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody()).isNotNull();
        assertThat(resp.getBody().present()).isFalse();
        verifyNoInteractions(paymentMethodDao);
    }

    @Test
    void noStripeCustomer_returnsAbsent() {
        User user = userWithId(6L, UUID.randomUUID());
        Team team = teamWithId(60L);
        when(userRepository.findBySupabaseId(any())).thenReturn(Optional.of(user));
        when(memberRepo.findPrimaryMembership(6L))
                .thenReturn(List.of(membership(team, user, TeamRole.LEADER)));
        PaygTeamExtensions ext = mock(PaygTeamExtensions.class);
        when(ext.getStripeCustomerId()).thenReturn(null);
        when(extRepo.findById(60L)).thenReturn(Optional.of(ext));

        ResponseEntity<PaymentMethodResponse> resp = controller.get(jwtAuth(user.getSupabaseId()));

        assertThat(resp.getBody()).isNotNull();
        assertThat(resp.getBody().present()).isFalse();
        verifyNoInteractions(paymentMethodDao);
    }

    @Test
    void cardOnFile_returnsPresentWithFields() {
        User user = userWithId(7L, UUID.randomUUID());
        Team team = teamWithId(70L);
        when(userRepository.findBySupabaseId(any())).thenReturn(Optional.of(user));
        when(memberRepo.findPrimaryMembership(7L))
                .thenReturn(List.of(membership(team, user, TeamRole.LEADER)));
        PaygTeamExtensions ext = mock(PaygTeamExtensions.class);
        when(ext.getStripeCustomerId()).thenReturn("cus_123");
        when(extRepo.findById(70L)).thenReturn(Optional.of(ext));
        when(paymentMethodDao.findDefaultCard("cus_123"))
                .thenReturn(Optional.of(new CardSummary("visa", "4242", 8, 2027)));

        ResponseEntity<PaymentMethodResponse> resp = controller.get(jwtAuth(user.getSupabaseId()));

        PaymentMethodResponse body = resp.getBody();
        assertThat(body).isNotNull();
        assertThat(body.present()).isTrue();
        assertThat(body.brand()).isEqualTo("visa");
        assertThat(body.last4()).isEqualTo("4242");
        assertThat(body.expMonth()).isEqualTo(8);
        assertThat(body.expYear()).isEqualTo(2027);
    }

    @Test
    void mirrorMissingCard_returnsAbsent() {
        User user = userWithId(8L, UUID.randomUUID());
        Team team = teamWithId(80L);
        when(userRepository.findBySupabaseId(any())).thenReturn(Optional.of(user));
        when(memberRepo.findPrimaryMembership(8L))
                .thenReturn(List.of(membership(team, user, TeamRole.LEADER)));
        PaygTeamExtensions ext = mock(PaygTeamExtensions.class);
        when(ext.getStripeCustomerId()).thenReturn("cus_456");
        when(extRepo.findById(80L)).thenReturn(Optional.of(ext));
        when(paymentMethodDao.findDefaultCard("cus_456")).thenReturn(Optional.empty());

        ResponseEntity<PaymentMethodResponse> resp = controller.get(jwtAuth(user.getSupabaseId()));

        assertThat(resp.getBody()).isNotNull();
        assertThat(resp.getBody().present()).isFalse();
    }

    // -----------------------------------------------------------------------------------------
    // Fixtures (mirroring PaygWalletControllerTest)
    // -----------------------------------------------------------------------------------------

    private static User userWithId(Long id, UUID supabaseId) {
        User u = new User();
        u.setId(id);
        u.setSupabaseId(supabaseId);
        return u;
    }

    private static Team teamWithId(Long id) {
        Team t = new Team();
        t.setId(id);
        t.setName("t-" + id);
        return t;
    }

    private static TeamMembership membership(Team team, User user, TeamRole role) {
        TeamMembership m = new TeamMembership();
        m.setTeam(team);
        m.setUser(user);
        m.setRole(role);
        return m;
    }

    private static Authentication jwtAuth(UUID supabaseId) {
        Jwt jwt =
                Jwt.withTokenValue("token")
                        .header("alg", "RS256")
                        .claim("sub", supabaseId.toString())
                        .claim("email", "user@example.com")
                        .build();
        return new EnhancedJwtAuthenticationToken(
                jwt, List.of(), "user@example.com", supabaseId.toString());
    }
}
