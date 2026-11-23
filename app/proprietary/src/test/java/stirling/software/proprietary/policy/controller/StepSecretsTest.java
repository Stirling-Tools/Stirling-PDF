package stirling.software.proprietary.policy.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.server.ResponseStatusException;

import io.swagger.v3.oas.annotations.media.Schema;

import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.util.SecretMasker;

class StepSecretsTest {

    private static final String ADD_PASSWORD = "/api/v1/security/add-password";
    private static final String COMPRESS = "/api/v1/misc/compress-pdf";

    private final StepSecrets stepSecrets =
            StepSecrets.forSecrets(Map.of(ADD_PASSWORD, Set.of("password", "ownerPassword")));

    @Test
    void masksSetPasswordsAndLeavesEverythingElse() {
        PipelineStep step =
                new PipelineStep(
                        ADD_PASSWORD,
                        parameters(
                                "password", "Open-Sesame", "ownerPassword", "", "keyLength", 256));
        PipelineStep compress = new PipelineStep(COMPRESS, parameters("password", "not-a-secret"));

        List<PipelineStep> masked = stepSecrets.mask(List.of(step, compress));

        // A blank password stays blank, so a read still tells "none set" from "set".
        assertThat(masked.get(0).parameters())
                .containsEntry("password", SecretMasker.REDACTED)
                .containsEntry("ownerPassword", "")
                .containsEntry("keyLength", 256);
        assertThat(masked.get(1)).isEqualTo(compress);
    }

    @Test
    void restoresEachStepFromTheStoredStepOfTheSameToolAndOccurrence() {
        List<PipelineStep> stored =
                List.of(
                        new PipelineStep(ADD_PASSWORD, parameters("password", "first")),
                        new PipelineStep(COMPRESS, parameters()),
                        new PipelineStep(ADD_PASSWORD, parameters("password", "second")));
        List<PipelineStep> incoming =
                List.of(
                        new PipelineStep(COMPRESS, parameters()),
                        new PipelineStep(
                                ADD_PASSWORD, parameters("password", SecretMasker.REDACTED)),
                        new PipelineStep(
                                ADD_PASSWORD, parameters("password", SecretMasker.REDACTED)));

        List<PipelineStep> restored = stepSecrets.restore(incoming, stored);

        assertThat(restored.get(1).parameters()).containsEntry("password", "first");
        assertThat(restored.get(2).parameters()).containsEntry("password", "second");
    }

    @Test
    void restoresOnlySentinelsAndOnlyInSecretFields() {
        List<PipelineStep> stored =
                List.of(
                        new PipelineStep(
                                ADD_PASSWORD,
                                parameters(
                                        "password", "old", "ownerPassword", "owner", "note", "x")));
        List<PipelineStep> incoming =
                List.of(
                        new PipelineStep(
                                ADD_PASSWORD,
                                parameters(
                                        "password",
                                        "retyped",
                                        "ownerPassword",
                                        SecretMasker.REDACTED,
                                        "note",
                                        SecretMasker.REDACTED)));

        PipelineStep restored = stepSecrets.restore(incoming, stored).getFirst();

        assertThat(restored.parameters())
                .containsEntry("password", "retyped")
                .containsEntry("ownerPassword", "owner")
                .containsEntry("note", SecretMasker.REDACTED);
    }

    @Test
    void rejectsASentinelLeftInAPasswordField() {
        List<PipelineStep> steps =
                List.of(
                        new PipelineStep(COMPRESS, parameters()),
                        new PipelineStep(
                                ADD_PASSWORD, parameters("password", SecretMasker.REDACTED)));

        assertThatThrownBy(() -> stepSecrets.requireUnmasked(steps))
                .isInstanceOfSatisfying(
                        ResponseStatusException.class,
                        e -> {
                            assertThat(e.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                            assertThat(e.getReason()).isEqualTo("Step 2: enter the password again");
                        });
    }

    @Test
    void readsPasswordFieldsFromTheRequestModelAndItsSuperclasses() throws Exception {
        HandlerMethod handler =
                new HandlerMethod(
                        new PasswordTool(),
                        PasswordTool.class.getMethod(
                                "protect", ProtectRequest.class, String.class));

        assertThat(StepSecrets.secretFields(handler))
                .containsExactlyInAnyOrder("password", "ownerPassword");
    }

    private static Map<String, Object> parameters(Object... keysAndValues) {
        Map<String, Object> parameters = new LinkedHashMap<>();
        for (int i = 0; i < keysAndValues.length; i += 2) {
            parameters.put((String) keysAndValues[i], keysAndValues[i + 1]);
        }
        return parameters;
    }

    static class PasswordRequest {
        @Schema(format = "password")
        private String password;
    }

    static class ProtectRequest extends PasswordRequest {
        @Schema(format = "password")
        private String ownerPassword;

        @Schema(description = "Not a secret")
        private String note;
    }

    static class PasswordTool {
        public void protect(ProtectRequest request, String label) {}
    }
}
