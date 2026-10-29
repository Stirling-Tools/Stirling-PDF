package stirling.software.proprietary.integration.purview.protection;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class RightsManagementControllerTest {

    @Test
    void normalizesRightNamesToTheSdkSpelling() {
        assertThat(
                        RightsManagementController.normalizeGrants(
                                "a@example.com,b@example.com=view,Print;c@example.com=EDIT"))
                .isEqualTo("a@example.com,b@example.com=VIEW,PRINT;c@example.com=EDIT");
    }

    @Test
    void rejectsAnUnknownRightInsteadOfEncryptingWithIt() {
        assertThatThrownBy(() -> RightsManagementController.normalizeGrants("a@example.com=FLY"))
                .isInstanceOf(RightsManagementException.class)
                .hasMessageContaining("FLY")
                .extracting("code")
                .isEqualTo(RightsManagementException.BAD_INPUT);
    }

    @Test
    void rejectsGrantsWithoutRights() {
        assertThatThrownBy(() -> RightsManagementController.normalizeGrants("a@example.com"))
                .isInstanceOf(RightsManagementException.class)
                .extracting("code")
                .isEqualTo(RightsManagementException.BAD_INPUT);
    }
}
