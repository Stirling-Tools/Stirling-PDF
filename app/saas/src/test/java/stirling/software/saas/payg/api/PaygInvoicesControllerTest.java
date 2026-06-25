package stirling.software.saas.payg.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

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

import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.saas.model.TeamMembership;
import stirling.software.saas.payg.api.PaygInvoicesController.InvoiceResponse;
import stirling.software.saas.payg.policy.PaygTeamExtensions;
import stirling.software.saas.payg.repository.PaygTeamExtensionsRepository;
import stirling.software.saas.payg.stripe.StripeInvoiceDao;
import stirling.software.saas.repository.TeamMembershipRepository;
import stirling.software.saas.util.AuthenticationUtils;

/**
 * Pure-Mockito unit tests for {@link PaygInvoicesController}. Confirms team is resolved from the
 * authenticated principal (never request), and the empty-list degrade paths (no team, no Stripe
 * customer, no rows) all return 200 + [] rather than 4xx/5xx.
 */
@ExtendWith(MockitoExtension.class)
class PaygInvoicesControllerTest {

    @Mock private StripeInvoiceDao invoiceDao;
    @Mock private PaygTeamExtensionsRepository extRepo;
    @Mock private TeamMembershipRepository memberRepo;
    @Mock private UserRepository userRepository;

    private PaygInvoicesController controller;
    private Authentication auth;

    @BeforeEach
    void setUp() {
        controller = new PaygInvoicesController(invoiceDao, extRepo, memberRepo, userRepository);
        auth =
                new AnonymousAuthenticationToken(
                        "k", "anonymousUser", List.of(new SimpleGrantedAuthority("ROLE_USER")));
    }

    @Test
    void list_unauthenticated_returns401() {
        try (var mocked = org.mockito.Mockito.mockStatic(AuthenticationUtils.class)) {
            mocked.when(() -> AuthenticationUtils.getCurrentUser(auth, userRepository))
                    .thenThrow(new SecurityException("not authenticated"));

            ResponseEntity<List<InvoiceResponse>> resp = controller.list(null, auth);

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
            verifyNoInteractions(invoiceDao, extRepo, memberRepo);
        }
    }

    @Test
    void list_noTeam_returnsEmpty() {
        User user = mockUser(42L);
        try (var mocked = org.mockito.Mockito.mockStatic(AuthenticationUtils.class)) {
            mocked.when(() -> AuthenticationUtils.getCurrentUser(auth, userRepository))
                    .thenReturn(user);
            when(memberRepo.findPrimaryMembership(42L)).thenReturn(List.of());

            ResponseEntity<List<InvoiceResponse>> resp = controller.list(null, auth);

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(resp.getBody()).isEmpty();
            verifyNoInteractions(invoiceDao, extRepo);
        }
    }

    @Test
    void list_noStripeCustomer_returnsEmpty() {
        User user = mockUser(42L);
        TeamMembership tm = mockMembership(7L);
        try (var mocked = org.mockito.Mockito.mockStatic(AuthenticationUtils.class)) {
            mocked.when(() -> AuthenticationUtils.getCurrentUser(auth, userRepository))
                    .thenReturn(user);
            when(memberRepo.findPrimaryMembership(42L)).thenReturn(List.of(tm));
            when(extRepo.findById(7L)).thenReturn(Optional.empty());

            ResponseEntity<List<InvoiceResponse>> resp = controller.list(null, auth);

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(resp.getBody()).isEmpty();
            verifyNoInteractions(invoiceDao);
        }
    }

    @Test
    void list_mapsRowsAndClampsLimit() {
        User user = mockUser(42L);
        TeamMembership tm = mockMembership(7L);
        PaygTeamExtensions ext = new PaygTeamExtensions();
        ext.setTeamId(7L);
        ext.setStripeCustomerId("cus_abc");

        StripeInvoiceDao.InvoiceRow row =
                new StripeInvoiceDao.InvoiceRow(
                        "in_1",
                        "STIR-0001",
                        "paid",
                        2500L,
                        "usd",
                        LocalDateTime.of(2026, 6, 1, 10, 0),
                        LocalDateTime.of(2026, 5, 1, 0, 0),
                        LocalDateTime.of(2026, 5, 31, 23, 59),
                        "https://stripe/invoice/1",
                        "https://stripe/invoice/1.pdf",
                        "Stirling Processor Plan",
                        50000L);

        try (var mocked = org.mockito.Mockito.mockStatic(AuthenticationUtils.class)) {
            mocked.when(() -> AuthenticationUtils.getCurrentUser(auth, userRepository))
                    .thenReturn(user);
            when(memberRepo.findPrimaryMembership(42L)).thenReturn(List.of(tm));
            when(extRepo.findById(7L)).thenReturn(Optional.of(ext));
            // 1000 should clamp to MAX_LIMIT (100) inside the controller.
            when(invoiceDao.findRecentByCustomer(eq("cus_abc"), eq(100))).thenReturn(List.of(row));

            ResponseEntity<List<InvoiceResponse>> resp = controller.list(1000, auth);

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(resp.getBody()).hasSize(1);
            InvoiceResponse body = resp.getBody().get(0);
            assertThat(body.id()).isEqualTo("in_1");
            assertThat(body.number()).isEqualTo("STIR-0001");
            assertThat(body.status()).isEqualTo("paid");
            assertThat(body.totalMinor()).isEqualTo(2500L);
            assertThat(body.currency()).isEqualTo("usd");
            assertThat(body.hostedInvoiceUrl()).isEqualTo("https://stripe/invoice/1");
            assertThat(body.description()).isEqualTo("Stirling Processor Plan");
            assertThat(body.pdfsProcessed()).isEqualTo(50000L);
        }
    }

    @Test
    void list_emptyDaoResult_returnsEmpty() {
        User user = mockUser(42L);
        TeamMembership tm = mockMembership(7L);
        PaygTeamExtensions ext = new PaygTeamExtensions();
        ext.setTeamId(7L);
        ext.setStripeCustomerId("cus_xyz");

        try (var mocked = org.mockito.Mockito.mockStatic(AuthenticationUtils.class)) {
            mocked.when(() -> AuthenticationUtils.getCurrentUser(auth, userRepository))
                    .thenReturn(user);
            when(memberRepo.findPrimaryMembership(42L)).thenReturn(List.of(tm));
            when(extRepo.findById(7L)).thenReturn(Optional.of(ext));
            when(invoiceDao.findRecentByCustomer(anyString(), anyInt())).thenReturn(List.of());

            ResponseEntity<List<InvoiceResponse>> resp = controller.list(null, auth);

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(resp.getBody()).isEmpty();
        }
    }

    private static User mockUser(long id) {
        User u = new User();
        u.setId(id);
        return u;
    }

    private static TeamMembership mockMembership(long teamId) {
        Team team = new Team();
        team.setId(teamId);
        TeamMembership tm = new TeamMembership();
        tm.setTeam(team);
        return tm;
    }
}
