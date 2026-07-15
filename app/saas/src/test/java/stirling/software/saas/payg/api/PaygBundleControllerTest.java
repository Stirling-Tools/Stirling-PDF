package stirling.software.saas.payg.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
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
import stirling.software.proprietary.model.TeamMembership;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamMembershipRepository;
import stirling.software.saas.payg.api.PaygBundleController.QuoteRequest;
import stirling.software.saas.payg.api.PaygBundleController.QuoteResponse;
import stirling.software.saas.payg.bundle.PrepaidPurchaseService;
import stirling.software.saas.payg.bundle.PrepaidPurchaseService.PrepaidQuote;
import stirling.software.saas.security.EnhancedJwtAuthenticationToken;

/**
 * Unit tests for {@link PaygBundleController} — leader-only enforcement, consent threading, quote.
 */
@ExtendWith(MockitoExtension.class)
class PaygBundleControllerTest {

    private static final String EULA = "eula-2026-07";

    @Mock private PrepaidPurchaseService purchaseService;
    @Mock private TeamMembershipRepository memberRepo;
    @Mock private UserRepository userRepository;

    private PaygBundleController controller() {
        return new PaygBundleController(purchaseService, memberRepo, userRepository);
    }

    private static PrepaidQuote sampleQuote(LocalDateTime expires) {
        return new PrepaidQuote(
                555L,
                120_000L,
                "usd",
                BigDecimal.valueOf(2),
                240_000L,
                200_000L,
                40_000L,
                12,
                10,
                expires);
    }

    @Test
    void quote_leader_returnsPricedQuote() {
        User leader = userWithId(20L, UUID.randomUUID());
        Team team = teamWithId(33L);
        when(userRepository.findBySupabaseId(any())).thenReturn(Optional.of(leader));
        when(memberRepo.findPrimaryMembership(20L))
                .thenReturn(List.of(membership(team, leader, TeamRole.LEADER)));
        LocalDateTime expires = LocalDateTime.of(2026, 8, 1, 12, 0);
        when(purchaseService.quote(eq(33L), eq(120_000L), any())).thenReturn(sampleQuote(expires));

        ResponseEntity<QuoteResponse> resp =
                controller()
                        .quote(
                                new QuoteRequest(120_000L, true, EULA),
                                jwtAuth(leader.getSupabaseId()));

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        QuoteResponse body = resp.getBody();
        assertThat(body).isNotNull();
        assertThat(body.quoteId()).isEqualTo(555L);
        assertThat(body.units()).isEqualTo(120_000L);
        assertThat(body.totalAmountMinor()).isEqualTo(200_000L);
        assertThat(body.expiresAt()).isEqualTo("2026-08-01T12:00:00");
    }

    @Test
    void quote_leaderConsented_passesEulaVersionToService() {
        User leader = userWithId(24L, UUID.randomUUID());
        Team team = teamWithId(37L);
        when(userRepository.findBySupabaseId(any())).thenReturn(Optional.of(leader));
        when(memberRepo.findPrimaryMembership(24L))
                .thenReturn(List.of(membership(team, leader, TeamRole.LEADER)));
        when(purchaseService.quote(eq(37L), anyLong(), any()))
                .thenReturn(sampleQuote(LocalDateTime.of(2026, 8, 1, 12, 0)));

        controller().quote(new QuoteRequest(60_000L, true, EULA), jwtAuth(leader.getSupabaseId()));

        ArgumentCaptor<String> consent = ArgumentCaptor.forClass(String.class);
        // The controller forwards the EULA version only because consented=true.
        org.mockito.Mockito.verify(purchaseService).quote(eq(37L), eq(60_000L), consent.capture());
        assertThat(consent.getValue()).isEqualTo(EULA);
    }

    @Test
    void quote_notConsented_forwardsNullConsent() {
        User leader = userWithId(25L, UUID.randomUUID());
        Team team = teamWithId(38L);
        when(userRepository.findBySupabaseId(any())).thenReturn(Optional.of(leader));
        when(memberRepo.findPrimaryMembership(25L))
                .thenReturn(List.of(membership(team, leader, TeamRole.LEADER)));
        // Service rejects a null consent (mirrors the real service) → controller maps to 400.
        when(purchaseService.quote(eq(38L), anyLong(), eq(null)))
                .thenThrow(new IllegalArgumentException("consent required"));

        ResponseEntity<QuoteResponse> resp =
                controller()
                        .quote(
                                new QuoteRequest(60_000L, false, EULA),
                                jwtAuth(leader.getSupabaseId()));

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void quote_member_isForbidden() {
        User member = userWithId(21L, UUID.randomUUID());
        Team team = teamWithId(34L);
        when(userRepository.findBySupabaseId(any())).thenReturn(Optional.of(member));
        when(memberRepo.findPrimaryMembership(21L))
                .thenReturn(List.of(membership(team, member, TeamRole.MEMBER)));

        ResponseEntity<QuoteResponse> resp =
                controller()
                        .quote(
                                new QuoteRequest(50_000L, true, EULA),
                                jwtAuth(member.getSupabaseId()));

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        verifyNoInteractions(purchaseService);
    }

    @Test
    void quote_noTeam_isForbidden() {
        User user = userWithId(22L, UUID.randomUUID());
        when(userRepository.findBySupabaseId(any())).thenReturn(Optional.of(user));
        when(memberRepo.findPrimaryMembership(22L)).thenReturn(List.of());

        ResponseEntity<QuoteResponse> resp =
                controller()
                        .quote(
                                new QuoteRequest(50_000L, true, EULA),
                                jwtAuth(user.getSupabaseId()));

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        verifyNoInteractions(purchaseService);
    }

    @Test
    void quote_anonymous_is401() {
        Authentication anon =
                new AnonymousAuthenticationToken(
                        "k",
                        "anonymousUser",
                        List.of(new SimpleGrantedAuthority("ROLE_ANONYMOUS")));

        ResponseEntity<QuoteResponse> resp =
                controller().quote(new QuoteRequest(50_000L, true, EULA), anon);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        verifyNoInteractions(purchaseService);
    }

    @Test
    void quote_serviceRejectsCapacity_isBadRequest() {
        User leader = userWithId(23L, UUID.randomUUID());
        Team team = teamWithId(35L);
        when(userRepository.findBySupabaseId(any())).thenReturn(Optional.of(leader));
        when(memberRepo.findPrimaryMembership(23L))
                .thenReturn(List.of(membership(team, leader, TeamRole.LEADER)));
        when(purchaseService.quote(eq(35L), anyLong(), any()))
                .thenThrow(new IllegalArgumentException("out of range"));

        ResponseEntity<QuoteResponse> resp =
                controller()
                        .quote(
                                new QuoteRequest(999_999_999_999L, true, EULA),
                                jwtAuth(leader.getSupabaseId()));

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    // ---- fixtures -----------------------------------------------------------

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
