package stirling.software.proprietary.classification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.UserServiceInterface;
import stirling.software.proprietary.classification.model.ClassificationLabel;
import stirling.software.proprietary.classification.model.ClassificationLabels;
import stirling.software.proprietary.classification.store.ClassificationLabelStore;
import stirling.software.proprietary.classification.store.InProcessClassificationLabelStore;
import stirling.software.proprietary.policy.config.PolicyManagementAuthority;

@ExtendWith(MockitoExtension.class)
@DisplayName("ClassificationLabelsController")
class ClassificationLabelsControllerTest {

    private static final Long TEAM = 7L;

    @Mock private PolicyManagementAuthority policyManagementAuthority;
    @Mock private UserServiceInterface userService;

    private ClassificationLabelStore store;
    private ApplicationProperties applicationProperties;
    private ClassificationLabelsController controller;

    @BeforeEach
    void setUp() {
        store = new InProcessClassificationLabelStore();
        applicationProperties = new ApplicationProperties();
        controller =
                new ClassificationLabelsController(
                        store, policyManagementAuthority, applicationProperties, userService);
    }

    private static ClassificationLabels sample() {
        return new ClassificationLabels(
                List.of(
                        new ClassificationLabel("invoice", "Invoice", "receipt-long"),
                        new ClassificationLabel("contract", "Contract", null)));
    }

    private void loginEnabled(boolean enabled) {
        applicationProperties.getSecurity().setEnableLogin(enabled);
    }

    @Test
    @DisplayName("GET returns 204 when the team has no labels")
    void getEmpty() {
        when(policyManagementAuthority.currentUserTeamId()).thenReturn(TEAM);
        ResponseEntity<ClassificationLabels> response = controller.getTeamLabels();
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    }

    @Test
    @DisplayName("PUT then GET round-trips the team's labels (login disabled)")
    void saveThenGet() {
        loginEnabled(false);
        when(policyManagementAuthority.currentUserTeamId()).thenReturn(TEAM);

        controller.saveTeamLabels(sample());
        ResponseEntity<ClassificationLabels> got = controller.getTeamLabels();

        assertThat(got.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(got.getBody()).isNotNull();
        assertThat(got.getBody().labels()).hasSize(2);
        assertThat(got.getBody().labels().getFirst().name()).isEqualTo("Invoice");
        assertThat(got.getBody().labels().getFirst().icon()).isEqualTo("receipt-long");
    }

    @Test
    @DisplayName("PUT is scoped per team")
    void perTeam() {
        loginEnabled(false);
        when(policyManagementAuthority.currentUserTeamId()).thenReturn(TEAM);
        controller.saveTeamLabels(sample());

        when(policyManagementAuthority.currentUserTeamId()).thenReturn(99L);
        assertThat(controller.getTeamLabels().getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    }

    @Test
    @DisplayName("PUT is rejected for a non-editor when login is enabled")
    void putForbiddenForNonEditor() {
        loginEnabled(true);
        when(policyManagementAuthority.canEditPolicies()).thenReturn(false);

        assertThatThrownBy(() -> controller.saveTeamLabels(sample()))
                .isInstanceOf(ResponseStatusException.class)
                .hasFieldOrPropertyWithValue("statusCode", HttpStatus.FORBIDDEN);
    }

    @Test
    @DisplayName("PUT rejects an invalid label set with 400")
    void putInvalid() {
        loginEnabled(false);
        ClassificationLabels duplicate =
                new ClassificationLabels(
                        List.of(
                                new ClassificationLabel("invoice", "Invoice", null),
                                new ClassificationLabel("invoice", "Invoice", null)));

        assertThatThrownBy(() -> controller.saveTeamLabels(duplicate))
                .isInstanceOf(ResponseStatusException.class)
                .hasFieldOrPropertyWithValue("statusCode", HttpStatus.BAD_REQUEST);
    }

    @Test
    @DisplayName("DELETE resets the team back to no stored labels")
    void deleteResets() {
        loginEnabled(false);
        when(policyManagementAuthority.currentUserTeamId()).thenReturn(TEAM);
        controller.saveTeamLabels(sample());

        ResponseEntity<Void> response = controller.resetTeamLabels();

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(controller.getTeamLabels().getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    }
}
