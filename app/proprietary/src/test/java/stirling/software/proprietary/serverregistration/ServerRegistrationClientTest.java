package stirling.software.proprietary.serverregistration;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import java.io.IOException;
import java.net.http.HttpClient;
import java.net.http.HttpResponse;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import jakarta.validation.Validation;

import stirling.software.proprietary.accountlink.AccountLinkProperties;

import tools.jackson.databind.ObjectMapper;

class ServerRegistrationClientTest {
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
        when(http.send(any(), any(HttpResponse.BodyHandler.class))).thenReturn(response);
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
