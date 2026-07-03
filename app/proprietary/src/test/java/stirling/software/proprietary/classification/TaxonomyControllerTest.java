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
import stirling.software.proprietary.classification.model.ClassificationTaxonomy;
import stirling.software.proprietary.classification.model.TaxonomyCategory;
import stirling.software.proprietary.classification.model.TaxonomyDocumentType;
import stirling.software.proprietary.classification.store.InProcessTaxonomyStore;
import stirling.software.proprietary.classification.store.TaxonomyStore;
import stirling.software.proprietary.policy.config.PolicyManagementAuthority;

@ExtendWith(MockitoExtension.class)
@DisplayName("TaxonomyController")
class TaxonomyControllerTest {

    private static final Long TEAM = 7L;

    @Mock private PolicyManagementAuthority policyManagementAuthority;
    @Mock private UserServiceInterface userService;

    private TaxonomyStore store;
    private ApplicationProperties applicationProperties;
    private TaxonomyController controller;

    @BeforeEach
    void setUp() {
        store = new InProcessTaxonomyStore();
        applicationProperties = new ApplicationProperties();
        controller =
                new TaxonomyController(
                        store, policyManagementAuthority, applicationProperties, userService);
    }

    private static ClassificationTaxonomy sample() {
        return new ClassificationTaxonomy(
                List.of(
                        new TaxonomyCategory(
                                "invoice",
                                "Invoice",
                                "receipt-long",
                                List.of(new TaxonomyDocumentType("receipt", "Receipt")))),
                List.of("finance"));
    }

    private void loginEnabled(boolean enabled) {
        applicationProperties.getSecurity().setEnableLogin(enabled);
    }

    @Test
    @DisplayName("GET returns 204 when the team has no taxonomy")
    void getEmpty() {
        when(policyManagementAuthority.currentUserTeamId()).thenReturn(TEAM);
        ResponseEntity<ClassificationTaxonomy> response = controller.getTaxonomy();
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    }

    @Test
    @DisplayName("PUT then GET round-trips the team's taxonomy (login disabled)")
    void saveThenGet() {
        loginEnabled(false);
        when(policyManagementAuthority.currentUserTeamId()).thenReturn(TEAM);

        controller.saveTaxonomy(sample());
        ResponseEntity<ClassificationTaxonomy> got = controller.getTaxonomy();

        assertThat(got.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(got.getBody()).isNotNull();
        assertThat(got.getBody().categories()).hasSize(1);
        assertThat(got.getBody().categories().getFirst().id()).isEqualTo("invoice");
    }

    @Test
    @DisplayName("PUT is scoped per team")
    void perTeam() {
        loginEnabled(false);
        when(policyManagementAuthority.currentUserTeamId()).thenReturn(TEAM);
        controller.saveTaxonomy(sample());

        when(policyManagementAuthority.currentUserTeamId()).thenReturn(99L);
        assertThat(controller.getTaxonomy().getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    }

    @Test
    @DisplayName("PUT is rejected for a non-editor when login is enabled")
    void putForbiddenForNonEditor() {
        loginEnabled(true);
        when(policyManagementAuthority.canEditPolicies()).thenReturn(false);

        assertThatThrownBy(() -> controller.saveTaxonomy(sample()))
                .isInstanceOf(ResponseStatusException.class)
                .hasFieldOrPropertyWithValue("statusCode", HttpStatus.FORBIDDEN);
    }

    @Test
    @DisplayName("PUT rejects an invalid taxonomy with 400")
    void putInvalid() {
        loginEnabled(false);

        assertThatThrownBy(
                        () ->
                                controller.saveTaxonomy(
                                        new ClassificationTaxonomy(List.of(), List.of())))
                .isInstanceOf(ResponseStatusException.class)
                .hasFieldOrPropertyWithValue("statusCode", HttpStatus.BAD_REQUEST);
    }

    @Test
    @DisplayName("DELETE resets the team back to no stored taxonomy")
    void deleteResets() {
        loginEnabled(false);
        when(policyManagementAuthority.currentUserTeamId()).thenReturn(TEAM);
        controller.saveTaxonomy(sample());

        ResponseEntity<Void> response = controller.resetTaxonomy();

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(controller.getTaxonomy().getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    }
}
