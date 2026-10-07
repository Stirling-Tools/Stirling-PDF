package stirling.software.saas.payg.cancellation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpStatus;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;

import stirling.software.saas.config.SupabaseConfigurationProperties;
import stirling.software.saas.payg.cancellation.CancellationEdgeClient.Target;

class CancellationEdgeClientTest {

    private final RestTemplate rest = mock(RestTemplate.class);

    private CancellationEdgeClient client(boolean configured) {
        SupabaseConfigurationProperties props = new SupabaseConfigurationProperties();
        if (configured) {
            props.setEdgeFunctionUrl("https://edge.example/functions/v1");
            props.setEdgeFunctionSecret("secret");
        }
        return new CancellationEdgeClient(props, rest);
    }

    @Test
    @SuppressWarnings({"unchecked", "rawtypes"})
    void sendsTheReasonWithTheSecretAndReadsWhatChanged() {
        ArgumentCaptor<HttpEntity> request = ArgumentCaptor.forClass(HttpEntity.class);
        when(rest.postForObject(
                        eq("https://edge.example/functions/v1/subscription-cancellation"),
                        request.capture(),
                        eq(Map.class)))
                .thenReturn(
                        Map.of(
                                "subscriptions",
                                List.of(
                                        Map.of(
                                                "product", "team",
                                                "subscription_id", "sub_team",
                                                "status", "active",
                                                "cancel_at_period_end", true,
                                                "ends_at", "2026-11-14T00:00:00.000Z",
                                                "period_end", "2026-11-14T00:00:00.000Z",
                                                "changed", true))));

        var results =
                client(true)
                        .change(
                                "cancel",
                                "cus_team",
                                List.of(new Target("team", "sub_team")),
                                CancelReason.NOT_WORKING,
                                "Exports fail",
                                "alex@acme.example");

        Map<String, Object> body = (Map<String, Object>) request.getValue().getBody();
        assertThat(request.getValue().getHeaders().getFirst("Authorization"))
                .isEqualTo("Bearer secret");
        assertThat(body)
                .containsEntry("action", "cancel")
                .containsEntry("customer", "cus_team")
                .containsEntry("feedback", "low_quality")
                .containsEntry("reason", "not_working")
                .containsEntry("reason_label", "Something isn't working")
                .containsEntry("comment", "Exports fail")
                .containsEntry("notify_email", "alex@acme.example");
        assertThat(results).hasSize(1);
        assertThat(results.getFirst().changed()).isTrue();
        assertThat(results.getFirst().endsAt()).isEqualTo("2026-11-14T00:00:00.000Z");
    }

    @Test
    void unconfiguredOrUnreachableIsReportedNotThrownRaw() {
        assertThatThrownBy(
                        () ->
                                client(false)
                                        .change("cancel", "cus_team", List.of(), null, null, null))
                .extracting(e -> ((CancellationException) e).status())
                .isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        verifyNoInteractions(rest);

        when(rest.postForObject(any(String.class), any(), eq(Map.class)))
                .thenThrow(new ResourceAccessException("timeout"));
        assertThatThrownBy(
                        () ->
                                client(true)
                                        .change(
                                                "resume",
                                                "cus_team",
                                                List.of(new Target("team", "sub_team")),
                                                null,
                                                null,
                                                null))
                .extracting(e -> ((CancellationException) e).status())
                .isEqualTo(HttpStatus.BAD_GATEWAY);
    }
}
