package stirling.software.saas.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;

import stirling.software.proprietary.security.model.ApiKeyAuthenticationToken;
import stirling.software.proprietary.security.model.User;
import stirling.software.saas.service.CreditService;
import stirling.software.saas.service.CreditService.CreditSummary;

/**
 * Regression coverage for finding #15: API-key users used to always see empty credits because the
 * controller blindly passed the API key string through to {@code getCreditSummaryBySupabaseId},
 * which then blew up on {@code UUID.fromString}. The new code reads the User from the principal and
 * prefers the linked Supabase ID, falling back to API-key-keyed credits.
 */
@ExtendWith(MockitoExtension.class)
class CreditControllerApiKeyTest {

    @Mock private CreditService creditService;

    @Test
    void apiKeyUserWithSupabaseIdGetsResolvedToSupabaseLookup() {
        UUID supabaseId = UUID.randomUUID();
        User u = new User();
        u.setSupabaseId(supabaseId);

        CreditSummary expected = creditSummary(42, 100);
        when(creditService.getCreditSummaryBySupabaseId(supabaseId.toString()))
                .thenReturn(expected);

        CreditController controller = new CreditController(creditService);
        ApiKeyAuthenticationToken token =
                new ApiKeyAuthenticationToken(u, "the-api-key", java.util.List.of());

        ResponseEntity<CreditSummary> resp = controller.getUserCredits(token);

        assertThat(resp.getBody()).isSameAs(expected);
        verify(creditService).getCreditSummaryBySupabaseId(supabaseId.toString());
    }

    @Test
    void apiKeyUserWithoutSupabaseIdFallsBackToApiKeyLookup() {
        User u = new User();
        // No supabaseId set — covers self-hosted / OSS-style API-only users.
        CreditSummary expected = creditSummary(7, 25);
        when(creditService.getCreditSummaryByApiKey("apikey-no-supabase")).thenReturn(expected);

        CreditController controller = new CreditController(creditService);
        ApiKeyAuthenticationToken token =
                new ApiKeyAuthenticationToken(u, "apikey-no-supabase", java.util.List.of());

        ResponseEntity<CreditSummary> resp = controller.getUserCredits(token);

        assertThat(resp.getBody()).isSameAs(expected);
        verify(creditService).getCreditSummaryByApiKey(eq("apikey-no-supabase"));
    }

    @Test
    void apiKeyTokenWithoutUserPrincipalFallsBackToApiKeyLookup() {
        // Edge: token wasn't constructed with a User principal. Should still attempt API-key
        // lookup rather than throw.
        CreditSummary expected = creditSummary(0, 0);
        when(creditService.getCreditSummaryByApiKey("orphan-key")).thenReturn(expected);

        CreditController controller = new CreditController(creditService);
        ApiKeyAuthenticationToken token =
                new ApiKeyAuthenticationToken("not-a-user", "orphan-key", java.util.List.of());

        ResponseEntity<CreditSummary> resp = controller.getUserCredits(token);

        assertThat(resp.getBody()).isNotNull();
        verify(creditService).getCreditSummaryByApiKey("orphan-key");
    }

    private static CreditSummary creditSummary(int remaining, int allocated) {
        return new CreditSummary(remaining, allocated, 0, 0, remaining, null, null, false);
    }
}
