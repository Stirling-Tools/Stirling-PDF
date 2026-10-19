package stirling.software.proprietary.integration.purview.protection;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.ObjectMapper;

class ProtectionInfoTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    @Test
    void viewOnlyRightsGrantNothingElse() {
        ProtectionInfo info =
                ProtectionInfo.fromHelper(
                        JSON.readTree(
                                """
                                {"type":"result",
                                 "label":{"id":"l1","name":"Confidential","parentName":"","color":"#FF0000","sensitivity":3},
                                 "protection":{"rights":["view","VIEWRIGHTSDATA"],"owner":"alice@contoso.com",
                                   "issuedTo":"bob@contoso.com","isIssuedToOwner":false,"contentId":"c1",
                                   "templateId":"t1","name":"Confidential - View only","allowOfflineAccess":true,
                                   "validUntil":1893456000}}
                                """));

        assertThat(info.permissions())
                .isEqualTo(
                        new ProtectionInfo.Permissions(
                                true, false, false, false, false, false, false));
        assertThat(info.rights()).containsExactly("VIEW", "VIEWRIGHTSDATA");
        assertThat(info.label().name()).isEqualTo("Confidential");
        assertThat(info.label().parentName()).isNull();
        assertThat(info.owner()).isEqualTo("alice@contoso.com");
        assertThat(info.validUntilEpochSeconds()).isEqualTo(1893456000L);
    }

    @Test
    void ownerImpliesEveryRight() {
        ProtectionInfo info =
                ProtectionInfo.fromHelper(
                        JSON.readTree("{\"label\":null,\"protection\":{\"rights\":[\"OWNER\"]}}"));

        assertThat(info.permissions())
                .isEqualTo(
                        new ProtectionInfo.Permissions(true, true, true, true, true, true, true));
        assertThat(info.label()).isNull();
    }

    @Test
    void docEditCountsAsEdit() {
        ProtectionInfo info =
                ProtectionInfo.fromHelper(
                        JSON.readTree(
                                "{\"protection\":{\"rights\":[\"VIEW\",\"DOCEDIT\",\"PRINT\"]}}"));

        assertThat(info.permissions().edit()).isTrue();
        assertThat(info.permissions().print()).isTrue();
        assertThat(info.permissions().copy()).isFalse();
    }

    @Test
    void unprotectedResultIsRejected() {
        assertThatThrownBy(
                        () ->
                                ProtectionInfo.fromHelper(
                                        JSON.readTree("{\"label\":null,\"protection\":null}")))
                .isInstanceOfSatisfying(
                        RightsManagementException.class,
                        e -> assertThat(e.getCode()).isEqualTo("not_protected"));
    }
}
