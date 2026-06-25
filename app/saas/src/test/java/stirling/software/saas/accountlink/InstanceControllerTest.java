package stirling.software.saas.accountlink;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

import stirling.software.saas.accountlink.InstanceController.EntitlementResponse;
import stirling.software.saas.payg.billing.TeamBillingContext;
import stirling.software.saas.payg.billing.TeamBillingService;
import stirling.software.saas.payg.entitlement.EntitlementService;
import stirling.software.saas.payg.entitlement.EntitlementSnapshot;
import stirling.software.saas.payg.model.EntitlementState;
import stirling.software.saas.payg.model.FeatureGate;
import stirling.software.saas.payg.model.FeatureSet;

/**
 * Pure-Mockito unit tests for {@link InstanceController} — the device-credential entitlement read.
 * The team is resolved from the {@link LinkedInstanceAuthenticationToken} principal, never a path
 * or body, and the minimal DTO maps straight off the billing context + entitlement snapshot.
 */
@ExtendWith(MockitoExtension.class)
class InstanceControllerTest {

    @Mock private EntitlementService entitlementService;
    @Mock private TeamBillingService billingService;
    @Mock private AccountLinkService accountLinkService;

    private InstanceController controller() {
        return new InstanceController(entitlementService, billingService, accountLinkService);
    }

    @Test
    void entitlement_resolvesTeamFromTokenAndMapsSnapshot() {
        Authentication token = new LinkedInstanceAuthenticationToken(1L, 42L);
        when(billingService.forTeam(42L)).thenReturn(subscribedBilling("sub_42", 120L));
        when(entitlementService.getSnapshot(42L))
                .thenReturn(snapshot(EntitlementState.WARNED, 90L, 1250L));

        ResponseEntity<EntitlementResponse> resp = controller().entitlement(token);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        EntitlementResponse body = resp.getBody();
        assertThat(body).isNotNull();
        assertThat(body.subscribed()).isTrue();
        assertThat(body.freeRemainingUnits()).isEqualTo(120L);
        assertThat(body.periodSpendUnits()).isEqualTo(90L);
        assertThat(body.periodCapUnits()).isEqualTo(1250L);
        // WARNED is still within budget for the gate's purposes → coarse OK.
        assertThat(body.state()).isEqualTo("OK");
    }

    @Test
    void entitlement_uncapped_returnsNullCapUnits() {
        Authentication token = new LinkedInstanceAuthenticationToken(2L, 7L);
        when(billingService.forTeam(7L)).thenReturn(freeBilling(500L));
        when(entitlementService.getSnapshot(7L))
                .thenReturn(snapshot(EntitlementState.FULL, 0L, null));

        ResponseEntity<EntitlementResponse> resp = controller().entitlement(token);

        EntitlementResponse body = resp.getBody();
        assertThat(body).isNotNull();
        assertThat(body.subscribed()).isFalse();
        assertThat(body.freeRemainingUnits()).isEqualTo(500L);
        assertThat(body.periodCapUnits()).isNull();
        assertThat(body.state()).isEqualTo("OK");
    }

    @Test
    void entitlement_degradedMapsToOverLimit() {
        // The instance gate parses OK / OVER_LIMIT, never the SaaS FULL/WARNED/DEGRADED enum.
        // DEGRADED (automation + AI gated) must reach the wire as OVER_LIMIT.
        Authentication token = new LinkedInstanceAuthenticationToken(3L, 8L);
        when(billingService.forTeam(8L)).thenReturn(subscribedBilling("sub_8", 0L));
        when(entitlementService.getSnapshot(8L))
                .thenReturn(snapshot(EntitlementState.DEGRADED, 1300L, 1250L));

        EntitlementResponse body = controller().entitlement(token).getBody();

        assertThat(body).isNotNull();
        assertThat(body.state()).isEqualTo("OVER_LIMIT");
    }

    @Test
    void entitlement_nonInstancePrincipalIsRejected() {
        Authentication anon =
                new AnonymousAuthenticationToken(
                        "k",
                        "anonymousUser",
                        List.of(new SimpleGrantedAuthority("ROLE_ANONYMOUS")));

        ResponseEntity<EntitlementResponse> resp = controller().entitlement(anon);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        verifyNoInteractions(entitlementService, billingService);
    }

    @Test
    void revokeSelf_callsServiceWithTokenIdentityAndReturns204() {
        Authentication token = new LinkedInstanceAuthenticationToken(11L, 22L);

        ResponseEntity<Void> resp = controller().revokeSelf(token);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        verify(accountLinkService).revoke(22L, 11L);
    }

    @Test
    void revokeSelf_rejectsNonInstancePrincipal() {
        Authentication anon =
                new AnonymousAuthenticationToken(
                        "k",
                        "anonymousUser",
                        List.of(new SimpleGrantedAuthority("ROLE_ANONYMOUS")));

        ResponseEntity<Void> resp = controller().revokeSelf(anon);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        verifyNoInteractions(accountLinkService);
    }

    @Test
    void whoami_returnsResolvedInstanceAndTeam() {
        Authentication token = new LinkedInstanceAuthenticationToken(5L, 9L);

        ResponseEntity<InstanceController.WhoAmIResponse> resp = controller().whoami(token);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody().instanceId()).isEqualTo(5L);
        assertThat(resp.getBody().teamId()).isEqualTo(9L);
    }

    private static TeamBillingContext freeBilling(long freeRemaining) {
        LocalDateTime start = LocalDateTime.now().withDayOfMonth(1);
        return new TeamBillingContext(
                false,
                null,
                start,
                start.plusMonths(1),
                freeRemaining,
                freeRemaining,
                null,
                null,
                null,
                null);
    }

    private static TeamBillingContext subscribedBilling(String subId, long freeRemaining) {
        LocalDateTime start = LocalDateTime.now().withDayOfMonth(1);
        return new TeamBillingContext(
                true,
                subId,
                start,
                start.plusMonths(1),
                500L,
                freeRemaining,
                BigDecimal.valueOf(2),
                "usd",
                2500L,
                1250L);
    }

    private static EntitlementSnapshot snapshot(EntitlementState state, long spend, Long cap) {
        LocalDateTime start = LocalDateTime.now().withDayOfMonth(1);
        return new EntitlementSnapshot(
                state,
                FeatureSet.FULL,
                List.of(FeatureGate.OFFSITE_PROCESSING),
                spend,
                cap,
                start,
                start.plusMonths(1),
                false);
    }
}
