package stirling.software.saas.legal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.saas.security.UserTeamResolver;

class LegalControllerTest {

    private LegalController controller;

    @BeforeEach
    void setUp() throws Exception {
        LegalDocumentRegistry registry = new LegalDocumentRegistry();
        registry.load();
        controller =
                new LegalController(
                        registry,
                        mock(LegalConsentService.class),
                        mock(UserTeamResolver.class),
                        mock(UserRepository.class));
    }

    @Test
    void servesThePublicDocuments() {
        for (String id : new String[] {"eula", "sla", "subprocessors"}) {
            var response = controller.document(id);
            assertThat(response.getStatusCode()).as(id).isEqualTo(HttpStatus.OK);
            assertThat(response.getBody().markdown()).as(id).isNotBlank();
        }
    }

    @Test
    void doesNotServeTheEnterpriseAgreement() {
        assertThat(controller.document("enterprise-agreement").getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
    }
}
