package stirling.software.proprietary.workflow.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.HashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

class WorkflowMetadataValidatorTest {

    @Test
    void rejectsWrongTypesForKnownMetadataFields() {
        Map<String, Object> metadata = new HashMap<>();
        metadata.put("showSignature", "true");

        assertThatThrownBy(() -> WorkflowMetadataValidator.validate(metadata))
                .isInstanceOfSatisfying(
                        ResponseStatusException.class,
                        exception -> {
                            org.assertj.core.api.Assertions.assertThat(exception.getStatusCode())
                                    .isEqualTo(HttpStatus.BAD_REQUEST);
                            org.assertj.core.api.Assertions.assertThat(exception.getReason())
                                    .isEqualTo(
                                            "Invalid workflowMetadata: showSignature must be a Boolean");
                        });
    }

    @Test
    void acceptsValidMetadataAndKeepsValues() {
        Map<String, Object> metadata =
                Map.of(
                        "showSignature",
                        true,
                        "pageNumber",
                        2,
                        "showLogo",
                        false,
                        "includeSummaryPage",
                        true,
                        "reason",
                        "Approval",
                        "location",
                        "London");

        org.assertj.core.api.Assertions.assertThat(WorkflowMetadataValidator.validate(metadata))
                .isSameAs(metadata);
    }
}
