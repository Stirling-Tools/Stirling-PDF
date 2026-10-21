package stirling.software.SPDF.model.api.security;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class PasswordRequestLoggingTest {
    @Test
    void addPasswordRetainsOptionsWithoutLoggingCredentials() {
        var request = new AddPasswordRequest();
        request.setPassword("opening-secret");
        request.setOwnerPassword("owner-secret");
        request.setSourcePassword("source-secret");
        request.setKeyLength(256);
        request.setPreserveExisting(true);

        assertThat(request.toString())
                .contains("keyLength=256", "preserveExisting=true")
                .doesNotContain("opening-secret", "owner-secret", "source-secret");
        assertThat(request.getPassword()).isEqualTo("opening-secret");
        assertThat(request.getOwnerPassword()).isEqualTo("owner-secret");
        assertThat(request.getSourcePassword()).isEqualTo("source-secret");
    }

    @Test
    void prepareDoesNotLogItsPassword() {
        var request = new PDFPasswordRequest();
        request.setPassword("prepare-secret");

        assertThat(request.toString()).doesNotContain("prepare-secret");
        assertThat(request.getPassword()).isEqualTo("prepare-secret");
    }

    @Test
    void removePasswordDoesNotLogInheritedOrSelectiveCredentials() {
        var request = new RemovePasswordRequest();
        request.setPassword("opening-secret");
        request.setOwnerPassword("owner-secret");
        request.setSourcePassword("source-secret");
        request.setRetainedOpeningPassword("retained-secret");
        request.setRemoveAll(true);

        assertThat(request.toString())
                .contains("removeAll=true")
                .doesNotContain(
                        "opening-secret", "owner-secret", "source-secret", "retained-secret");
        assertThat(request.getPassword()).isEqualTo("opening-secret");
        assertThat(request.getOwnerPassword()).isEqualTo("owner-secret");
        assertThat(request.getSourcePassword()).isEqualTo("source-secret");
        assertThat(request.getRetainedOpeningPassword()).isEqualTo("retained-secret");
    }
}
