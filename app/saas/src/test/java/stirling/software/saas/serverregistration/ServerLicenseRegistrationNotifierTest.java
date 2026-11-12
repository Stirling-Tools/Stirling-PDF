package stirling.software.saas.serverregistration;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import java.io.IOException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Flow;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.mock.env.MockEnvironment;

import tools.jackson.databind.ObjectMapper;

@ExtendWith(OutputCaptureExtension.class)
class ServerLicenseRegistrationNotifierTest {
    private static final String WEBHOOK = "https://hooks.slack.com/services/test/only/secret";
    private final ObjectMapper mapper = new ObjectMapper();
    private final HttpClient http = mock(HttpClient.class);
    private final ServerLicenseRegistrationNotifier notifier =
            new ServerLicenseRegistrationNotifier(WEBHOOK, mapper, http);

    @Test
    void sendsIdentifiersAndCountsAsPlainText() throws Exception {
        respond(200);
        var event = event("sub_test", 0);
        notifier.notifyFirstSync(event);
        var request = ArgumentCaptor.forClass(HttpRequest.class);
        verify(http).sendAsync(request.capture(), any());
        assertThat(request.getValue().uri().toString()).isEqualTo(WEBHOOK);
        var payload = mapper.readTree(requestBody(request.getValue()));
        assertThat(payload.path("text").asText()).isEqualTo("Server license first sync");
        assertThat(payload.at("/blocks/1/text/type").asText()).isEqualTo("plain_text");
        assertThat(payload.at("/blocks/1/text/text").asText())
                .contains(event.licenseId().toString(), "sub_test", "147", "Unlimited")
                .doesNotContain("registrationSecret", "licenseProof", WEBHOOK);
    }

    @Test
    void unmatchedPurchaseAndUnspecifiedAllowanceRemainExplicit() throws Exception {
        respond(200);
        notifier.notifyFirstSync(event(null, null));
        var request = ArgumentCaptor.forClass(HttpRequest.class);
        verify(http).sendAsync(request.capture(), any());
        String body = requestBody(request.getValue());
        assertThat(body).contains("Unresolved", "Unknown").doesNotContain("Unlimited");
    }

    @ParameterizedTest
    @ValueSource(ints = {302, 400, 429, 500})
    void slackErrorsCannotFailCollectionOrExposeTheWebhook(int status, CapturedOutput output)
            throws Exception {
        respond(status);
        assertThatCode(() -> notifier.notifyFirstSync(event("sub_test", 100)))
                .doesNotThrowAnyException();
        assertThat(output.getAll())
                .contains("HTTP " + status)
                .doesNotContain(WEBHOOK, "sensitive-response");
        verify(http).sendAsync(any(), any());
    }

    @Test
    void transportErrorsAreRedacted(CapturedOutput output) {
        when(http.sendAsync(any(), any(HttpResponse.BodyHandler.class)))
                .thenReturn(CompletableFuture.failedFuture(new IOException(WEBHOOK)));
        assertThatCode(() -> notifier.notifyFirstSync(event("sub_test", 100)))
                .doesNotThrowAnyException();
        assertThat(output.getAll()).contains("alert failed").doesNotContain(WEBHOOK);
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "",
                "http://hooks.slack.com/services/test",
                "https://example.com/secret",
                "not a URL"
            })
    void missingOrInvalidDestinationsNeverSend(String url, CapturedOutput output) {
        var disabled = new ServerLicenseRegistrationNotifier(url, mapper, http);
        disabled.notifyFirstSync(event("sub_test", 100));
        verifyNoInteractions(http);
        assertThat(output.getAll()).doesNotContain("example.com/secret", "not a URL");
    }

    @Test
    void usesOnlyTheSupabaseAlertsDestination() {
        var environment =
                new MockEnvironment()
                        .withProperty("SUPA_ALERTS_WEBHOOK_URL", " ")
                        .withProperty("SUPABASE_ALERTS_WEBHOOK_URL", WEBHOOK)
                        .withProperty(
                                "SLACK_WEBHOOK_URL",
                                "https://hooks.slack.com/services/wrong/channel");
        assertThat(new ServerLicenseRegistrationNotifier(environment, mapper))
                .extracting("webhookUrl")
                .isEqualTo(WEBHOOK);
        environment.setProperty(
                "SUPA_ALERTS_WEBHOOK_URL", "https://hooks.slack.com/services/preferred/channel");
        assertThat(new ServerLicenseRegistrationNotifier(environment, mapper))
                .extracting("webhookUrl")
                .isEqualTo("https://hooks.slack.com/services/preferred/channel");
    }

    @SuppressWarnings("unchecked")
    private void respond(int status) {
        HttpResponse<String> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(status);
        when(response.body()).thenReturn("sensitive-response");
        when(http.sendAsync(any(), any(HttpResponse.BodyHandler.class)))
                .thenReturn(CompletableFuture.completedFuture(response));
    }

    private ServerLicenseRegistrationNotifier.FirstSync event(
            String subscription, Integer allowance) {
        return new ServerLicenseRegistrationNotifier.FirstSync(
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                subscription,
                147,
                allowance);
    }

    private String requestBody(HttpRequest request) throws Exception {
        var body = HttpResponse.BodySubscribers.ofString(StandardCharsets.UTF_8);
        request.bodyPublisher()
                .orElseThrow()
                .subscribe(
                        new Flow.Subscriber<ByteBuffer>() {
                            @Override
                            public void onSubscribe(Flow.Subscription subscription) {
                                body.onSubscribe(subscription);
                            }

                            @Override
                            public void onNext(ByteBuffer item) {
                                body.onNext(List.of(item));
                            }

                            @Override
                            public void onError(Throwable failure) {
                                body.onError(failure);
                            }

                            @Override
                            public void onComplete() {
                                body.onComplete();
                            }
                        });
        return body.getBody().toCompletableFuture().get(1, TimeUnit.SECONDS);
    }
}
