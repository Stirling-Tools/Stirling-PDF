package stirling.software.proprietary.integration.purview.protection;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.DisabledOnOs;
import org.junit.jupiter.api.condition.OS;
import org.junit.jupiter.api.io.TempDir;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.connectedaccount.CloudProvider;
import stirling.software.proprietary.connectedaccount.ConnectedAccount;
import stirling.software.proprietary.connectedaccount.ConnectedAccountService;

@DisabledOnOs(OS.WINDOWS)
class RightsManagementServiceTest {

    @TempDir Path dir;

    private RightsManagementService serviceRunning(String script) throws IOException {
        Path helper = dir.resolve("fake-mip");
        Files.writeString(helper, "#!/bin/sh\n" + script, StandardCharsets.UTF_8);
        Files.setPosixFilePermissions(helper, PosixFilePermissions.fromString("rwx------"));
        ApplicationProperties properties = new ApplicationProperties();
        ApplicationProperties.Premium.ProFeatures.Microsoft microsoft =
                properties.getPremium().getProFeatures().getMicrosoft();
        microsoft.setEnabled(true);
        microsoft.setClientId("client");
        microsoft.getRightsManagement().setEnabled(true);
        microsoft.getRightsManagement().setHelperPath(helper.toString());
        ConnectedAccountService accounts = mock(ConnectedAccountService.class);
        when(accounts.isAvailable(CloudProvider.MICROSOFT)).thenReturn(true);
        when(accounts.accessToken(eq(7L), anyList())).thenReturn("token");
        return new RightsManagementService(new MipHelper(properties), accounts, properties);
    }

    private static ConnectedAccount account() {
        ConnectedAccount account = new ConnectedAccount();
        account.setId(7L);
        account.setEmail("alice@contoso.com");
        return account;
    }

    @Test
    void listsLabelsAsTheConnectedUserWithoutAnInputFile() throws IOException {
        RightsManagementService service =
                serviceRunning(
                        """
                        case "$*" in *--input*) echo '{"type":"error","code":"failed","message":"unexpected input"}'; exit 1;; esac
                        case "$*" in *"--user alice@contoso.com"*) ;; *) echo '{"type":"error","code":"failed","message":"wrong user"}'; exit 1;; esac
                        echo '{"type":"result","labels":[{"id":"l1","name":"Confidential","parentName":"","color":"#A4262C","sensitivity":2},{"id":"l2","name":"Board","parentName":"Confidential","color":"","sensitivity":3}]}'
                        """);

        assertThat(service.labels(account()))
                .containsExactly(
                        new RightsManagementService.AvailableLabel(
                                "l1", "Confidential", null, "#A4262C", 2),
                        new RightsManagementService.AvailableLabel(
                                "l2", "Board", "Confidential", null, 3));
    }

    @Test
    void applyingALabelReturnsWhatTheHelperWrote() throws IOException {
        RightsManagementService service =
                serviceRunning(
                        """
                        while [ $# -gt 0 ]; do
                          case "$1" in --output) out="$2";; --label-id) label="$2";; esac
                          shift
                        done
                        printf 'protected-with-%s' "$label" > "$out"
                        echo '{"type":"result","label":null,"protection":null}'
                        """);
        Path pdf = Files.writeString(dir.resolve("in.pdf"), "%PDF-1.7");

        byte[] result = service.applyLabel(account(), pdf, "l1");

        assertThat(new String(result, StandardCharsets.UTF_8)).isEqualTo("protected-with-l1");
    }
}
