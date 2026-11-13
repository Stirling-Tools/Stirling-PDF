package stirling.software.proprietary.serverregistration;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.http.HttpClient;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.util.UUID;
import java.util.concurrent.CancellationException;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import com.sun.net.httpserver.HttpServer;

import jakarta.validation.Validation;

import stirling.software.proprietary.accountlink.AccountLinkProperties;

import tools.jackson.databind.ObjectMapper;

class ServerRegistrationClientTest {
    @Test
    @Timeout(10)
    @SuppressWarnings("unchecked")
    void deadlineCancelsResponseThatStallsAfterHeaders() throws Exception {
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        var headersSent = new CountDownLatch(1);
        server.createContext(
                ServerRegistrationProtocol.PATH,
                exchange -> {
                    exchange.getRequestBody().readAllBytes();
                    exchange.sendResponseHeaders(200, 100);
                    exchange.getResponseBody().write('{');
                    exchange.getResponseBody().flush();
                    headersSent.countDown();
                });
        server.start();
        try (var realHttp = HttpClient.newHttpClient()) {
            var http = mock(HttpClient.class);
            var pending = new AtomicReference<CompletableFuture<HttpResponse<String>>>();
            when(http.sendAsync(any(), any(HttpResponse.BodyHandler.class)))
                    .thenAnswer(
                            call -> {
                                var future =
                                        realHttp.sendAsync(
                                                call.getArgument(0),
                                                HttpResponse.BodyHandlers.ofString());
                                pending.set(future);
                                return future;
                            });
            var properties = new AccountLinkProperties();
            properties.setSaasBaseUrl("http://127.0.0.1:" + server.getAddress().getPort());
            properties.setRequestTimeoutSeconds(1);
            var client = new ServerRegistrationClient(properties, new ObjectMapper(), http);
            assertThatThrownBy(
                            () ->
                                    client.sync(
                                            new ServerRegistrationProtocol.SyncRequest(
                                                    UUID.randomUUID(),
                                                    "a".repeat(43),
                                                    new ServerRegistrationProtocol.Report(
                                                            1L, 1L, "test", 1))))
                    .isInstanceOf(HttpTimeoutException.class);
            assertThat(headersSent.getCount()).isZero();
            assertThatThrownBy(() -> pending.get().get(1, TimeUnit.SECONDS))
                    .isInstanceOfAny(CancellationException.class, ExecutionException.class)
                    .satisfies(
                            failure ->
                                    assertThat(
                                                    failure instanceof CancellationException
                                                            ? failure
                                                            : failure.getCause())
                                            .isInstanceOf(CancellationException.class));
        } finally {
            server.stop(0);
        }
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "null",
                "{}",
                "{\"registrationId\":\"not-a-uuid\",\"acceptedSequence\":100}"
            })
    @SuppressWarnings("unchecked")
    void malformedConflictCannotReconcileState(String body) throws Exception {
        var http = mock(HttpClient.class);
        HttpResponse<String> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(409);
        when(response.body()).thenReturn(body);
        when(http.sendAsync(any(), any(HttpResponse.BodyHandler.class)))
                .thenReturn(CompletableFuture.completedFuture(response));
        var client =
                new ServerRegistrationClient(new AccountLinkProperties(), new ObjectMapper(), http);
        assertThatThrownBy(
                        () ->
                                client.sync(
                                        new ServerRegistrationProtocol.SyncRequest(
                                                UUID.randomUUID(),
                                                "a".repeat(43),
                                                new ServerRegistrationProtocol.Report(
                                                        1L, 1L, "test", 1))))
                .isInstanceOf(IOException.class)
                .isNotInstanceOf(ServerRegistrationClient.SequenceConflictException.class);
    }

    @Test
    @SuppressWarnings("unchecked")
    void interruptionCancelsOutstandingExchangeAndPreservesInterrupt() throws Exception {
        var http = mock(HttpClient.class);
        var pending = new CompletableFuture<HttpResponse<String>>();
        when(http.sendAsync(any(), any(HttpResponse.BodyHandler.class))).thenReturn(pending);
        var client =
                new ServerRegistrationClient(new AccountLinkProperties(), new ObjectMapper(), http);
        Thread.currentThread().interrupt();
        try {
            assertThatThrownBy(
                            () ->
                                    client.sync(
                                            new ServerRegistrationProtocol.SyncRequest(
                                                    UUID.randomUUID(),
                                                    "a".repeat(43),
                                                    new ServerRegistrationProtocol.Report(
                                                            1L, 1L, "test", 1))))
                    .isInstanceOf(IOException.class)
                    .hasMessage("Registration interrupted");
            assertThat(Thread.currentThread().isInterrupted()).isTrue();
            assertThat(pending).isCancelled();
        } finally {
            Thread.interrupted();
        }
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "http://remote.example",
                "https://user:secret@example.com",
                "https://example.com?key=value"
            })
    void refusesUnsafeLicenseTransport(String url) {
        var properties = new AccountLinkProperties();
        properties.setSaasBaseUrl(url);
        assertThatIllegalArgumentException()
                .isThrownBy(
                        () ->
                                new ServerRegistrationClient(
                                        properties, new ObjectMapper(), mock(HttpClient.class)));
    }

    @Test
    @SuppressWarnings("unchecked")
    void upstreamErrorsCannotLeakProofOrSecret() throws Exception {
        var http = mock(HttpClient.class);
        HttpResponse<String> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(400);
        when(response.body()).thenReturn("sensitive-license");
        when(http.sendAsync(any(), any(HttpResponse.BodyHandler.class)))
                .thenReturn(CompletableFuture.completedFuture(response));
        var client =
                new ServerRegistrationClient(new AccountLinkProperties(), new ObjectMapper(), http);
        assertThatThrownBy(
                        () ->
                                client.sync(
                                        new ServerRegistrationProtocol.SyncRequest(
                                                UUID.randomUUID(),
                                                "a".repeat(43),
                                                new ServerRegistrationProtocol.Report(
                                                        1L, 0L, "test", 1))))
                .isInstanceOf(IOException.class)
                .hasMessage("Registration returned HTTP 400");
        verify(response, never()).body();
    }

    @Test
    @SuppressWarnings("unchecked")
    void nullResponseIsRejectedWithoutAcknowledging() throws Exception {
        var http = mock(HttpClient.class);
        HttpResponse<String> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(200);
        when(response.body()).thenReturn("null");
        when(http.sendAsync(any(), any(HttpResponse.BodyHandler.class)))
                .thenReturn(CompletableFuture.completedFuture(response));
        var client =
                new ServerRegistrationClient(new AccountLinkProperties(), new ObjectMapper(), http);
        assertThatThrownBy(
                        () ->
                                client.sync(
                                        new ServerRegistrationProtocol.SyncRequest(
                                                UUID.randomUUID(),
                                                "a".repeat(43),
                                                new ServerRegistrationProtocol.Report(
                                                        1L, 0L, "test", 1))))
                .isInstanceOf(IOException.class)
                .hasMessage("Incomplete registration response");
    }

    @Test
    void countsAndSequencesAreRequiredAndSecretsAreRedacted() {
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            var validator = factory.getValidator();
            assertThat(
                            validator.validate(
                                    new ServerRegistrationProtocol.Report(1L, null, "test", 1)))
                    .isNotEmpty();
            assertThat(validator.validate(new ServerRegistrationProtocol.Report(0L, 0L, "test", 1)))
                    .isNotEmpty();
            assertThat(
                            validator.validate(
                                    new ServerRegistrationProtocol.Report(1L, -1L, "test", 1)))
                    .isNotEmpty();
            assertThat(validator.validate(new ServerRegistrationProtocol.Report(1L, 0L, "test", 1)))
                    .isEmpty();
            var request =
                    new ServerRegistrationProtocol.RegistrationRequest(
                            UUID.randomUUID(),
                            "sensitive-license",
                            "fingerprint",
                            "a".repeat(43),
                            new ServerRegistrationProtocol.Report(1L, 147L, "test", 1));
            assertThat(validator.validate(request)).isEmpty();
            assertThat(request.toString()).doesNotContain("sensitive-license", "a".repeat(43));
        }
    }
}
