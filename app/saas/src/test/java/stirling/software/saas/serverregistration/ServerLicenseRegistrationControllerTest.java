package stirling.software.saas.serverregistration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.common.cluster.RateLimitStore;
import stirling.software.common.cluster.RateLimitStore.RateLimitDecision;
import stirling.software.proprietary.serverregistration.ServerRegistrationProtocol;
import stirling.software.proprietary.serverregistration.ServerRegistrationProtocol.*;

import tools.jackson.databind.ObjectMapper;

class ServerLicenseRegistrationControllerTest {
    private final KeygenServerLicenseVerifier verifier = mock(KeygenServerLicenseVerifier.class);
    private final ServerLicenseRegistrationStore store = mock(ServerLicenseRegistrationStore.class);
    private final RateLimitStore limits = mock(RateLimitStore.class);
    private final ObjectMapper mapper = new ObjectMapper();
    private MockMvc mvc;

    @BeforeEach
    void setup() {
        when(limits.tryConsume(anyString(), anyLong(), any()))
                .thenReturn(new RateLimitDecision(true, 29, 0));
        mvc =
                MockMvcBuilders.standaloneSetup(
                                new ServerLicenseRegistrationController(verifier, store, limits))
                        .build();
    }

    @Test
    void featureIsAbsentByDefaultEvenInCloudProfile() {
        new ApplicationContextRunner()
                .withPropertyValues("spring.profiles.active=saas")
                .withUserConfiguration(
                        ServerLicenseRegistrationController.class,
                        KeygenServerLicenseVerifier.class,
                        ServerLicenseRegistrationStore.class)
                .run(
                        context -> {
                            assertThat(context).hasNotFailed();
                            assertThat(context)
                                    .doesNotHaveBean(ServerLicenseRegistrationController.class);
                            assertThat(context).doesNotHaveBean(KeygenServerLicenseVerifier.class);
                            assertThat(context)
                                    .doesNotHaveBean(ServerLicenseRegistrationStore.class);
                        });
    }

    @Test
    void missingCountsAreRejectedBeforeProofValidationOrPersistence() throws Exception {
        RegistrationRequest request = request(new Report(1L, null, "test", 1));
        mvc.perform(
                        post(ServerRegistrationProtocol.PATH)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(mapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(verifier, store, limits);
    }

    @Test
    @ExtendWith(OutputCaptureExtension.class)
    void invalidCredentialsCannotAppearInValidationResponsesOrLogs(CapturedOutput output)
            throws Exception {
        String secret = "invalid-test-secret-that-must-stay-private";
        RegistrationRequest request =
                new RegistrationRequest(
                        UUID.randomUUID(),
                        "test-proof",
                        "machine",
                        secret,
                        new Report(1L, 147L, "test", 1));
        String result =
                mvc.perform(
                                post(ServerRegistrationProtocol.PATH)
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(mapper.writeValueAsString(request)))
                        .andExpect(status().isBadRequest())
                        .andReturn()
                        .getResponse()
                        .getContentAsString();
        assertThat(result)
                .contains("Invalid registration request")
                .doesNotContain(secret, "test-proof");
        String malformed =
                mapper.writeValueAsString(request)
                        .replace(request.installationId().toString(), secret);
        String malformedResult =
                mvc.perform(
                                post(ServerRegistrationProtocol.PATH)
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(malformed))
                        .andExpect(status().isBadRequest())
                        .andReturn()
                        .getResponse()
                        .getContentAsString();
        assertThat(malformedResult)
                .contains("Invalid registration request")
                .doesNotContain(secret, "test-proof");
        assertThat(output.getAll()).doesNotContain(secret, "test-proof");
        verifyNoInteractions(verifier, store, limits);
    }

    @Test
    void rateLimitStopsKeygenAndRegistrationWrites() throws Exception {
        when(limits.tryConsume(anyString(), anyLong(), any()))
                .thenReturn(new RateLimitDecision(false, 0, 1));
        mvc.perform(
                        post(ServerRegistrationProtocol.PATH)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        mapper.writeValueAsString(
                                                request(new Report(1L, 147L, "test", 1)))))
                .andExpect(status().isTooManyRequests());
        verifyNoInteractions(verifier, store);
    }

    @Test
    void rejectedLicenseCannotCreateARecord() throws Exception {
        when(verifier.verify(anyString(), anyString()))
                .thenThrow(new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        mvc.perform(
                        post(ServerRegistrationProtocol.PATH)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        mapper.writeValueAsString(
                                                request(new Report(1L, 147L, "test", 1)))))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(store);
    }

    @Test
    void syncUsesTrackingCredentialWithoutRepeatingLicenseProof() throws Exception {
        SyncRequest request =
                new SyncRequest(UUID.randomUUID(), "a".repeat(43), new Report(2L, 147L, "test", 1));
        when(store.sync(request))
                .thenReturn(new Receipt(request.registrationId(), 2, PurchaseMapping.RESOLVED));
        mvc.perform(
                        post(ServerRegistrationProtocol.PATH + "/sync")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(mapper.writeValueAsString(request)))
                .andExpect(status().isOk());
        verify(store).sync(request);
        verifyNoInteractions(verifier);
    }

    private RegistrationRequest request(Report report) {
        return new RegistrationRequest(
                UUID.randomUUID(), "test-proof", "machine", "a".repeat(43), report);
    }
}
