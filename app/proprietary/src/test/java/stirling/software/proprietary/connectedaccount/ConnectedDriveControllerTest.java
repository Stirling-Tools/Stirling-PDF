package stirling.software.proprietary.connectedaccount;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.proprietary.policy.microsoft.ConnectedDriveWriter;

class ConnectedDriveControllerTest {

    @Test
    void anItemIdReplacesThatItem() {
        assertThat(ConnectedDriveController.target("d", "i", "\"e\"", "p", "x.pdf"))
                .isEqualTo(new ConnectedDriveWriter.Replace("d", "i", "\"e\""));
    }

    @Test
    void aReplaceWithoutAVersionIsRefused() {
        for (String eTag : new String[] {null, " "}) {
            assertThatThrownBy(() -> ConnectedDriveController.target("d", "i", eTag, "p", "x.pdf"))
                    .isInstanceOf(ResponseStatusException.class)
                    .hasMessageContaining("eTag");
        }
    }

    @Test
    void aFolderAndNameCreateAFileThatRenamesOnConflict() {
        assertThat(ConnectedDriveController.target("d", null, null, "p", " Report.pdf "))
                .isEqualTo(new ConnectedDriveWriter.Create("d", "p", "Report.pdf", true));
    }

    @Test
    void namesThatCouldEscapeTheFolderAreRefused() {
        for (String name : new String[] {"../x.pdf", "a/b.pdf", "a\\b.pdf", "..", "."}) {
            assertThatThrownBy(() -> ConnectedDriveController.target("d", null, null, "p", name))
                    .isInstanceOf(ResponseStatusException.class);
        }
    }

    @Test
    void aDriveAndATargetAreRequired() {
        assertThatThrownBy(() -> ConnectedDriveController.target(" ", "i", null, null, null))
                .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> ConnectedDriveController.target("d", null, null, null, "x.pdf"))
                .isInstanceOf(ResponseStatusException.class);
    }
}
