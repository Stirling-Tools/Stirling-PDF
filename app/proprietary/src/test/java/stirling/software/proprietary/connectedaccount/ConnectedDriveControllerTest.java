package stirling.software.proprietary.connectedaccount;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.policy.microsoft.ConnectedDriveWriter;

class ConnectedDriveControllerTest {

    @Test
    void anItemIdReplacesThatItem() {
        assertThat(ConnectedDriveController.target("d", "i", "\"e\"", "p", "x.pdf"))
                .isEqualTo(new ConnectedDriveWriter.Replace("d", "i", "\"e\""));
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = " ")
    void aReplaceWithoutAVersionIsRefused(String eTag) {
        assertThatThrownBy(() -> ConnectedDriveController.target("d", "i", eTag, "p", "x.pdf"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("eTag");
    }

    @Test
    void aFolderAndNameCreateAFileThatRenamesOnConflict() {
        assertThat(ConnectedDriveController.target("d", null, null, "p", " Report.pdf "))
                .isEqualTo(new ConnectedDriveWriter.Create("d", "p", "Report.pdf", true));
    }

    @ParameterizedTest
    @ValueSource(strings = {"../x.pdf", "a/b.pdf", "a\\b.pdf", "..", "."})
    void namesThatCouldEscapeTheFolderAreRefused(String name) {
        assertThatThrownBy(() -> ConnectedDriveController.target("d", null, null, "p", name))
                .isInstanceOf(ResponseStatusException.class);
    }

    @ParameterizedTest
    @CsvSource(
            nullValues = "null",
            value = {
                "'..', i, null, null",
                "'.', i, null, null",
                "d, '..', null, null",
                "d, '.', null, null",
                "d, null, '..', x.pdf",
                "d, null, '.', x.pdf"
            })
    void idsThatCouldLeaveTheGraphPathAreRefused(
            String driveId, String itemId, String parentId, String name) {
        assertThatThrownBy(
                        () ->
                                ConnectedDriveController.target(
                                        driveId, itemId, "\"e\"", parentId, name))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("invalid drive or item ID");
    }

    @ParameterizedTest
    @CsvSource(
            nullValues = "null",
            value = {"' ', i, null, null", "d, null, null, x.pdf"})
    void aDriveAndATargetAreRequired(String driveId, String itemId, String parentId, String name) {
        assertThatThrownBy(
                        () ->
                                ConnectedDriveController.target(
                                        driveId, itemId, null, parentId, name))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void editorSavesCanBeTurnedOff() {
        ApplicationProperties properties = new ApplicationProperties();
        assertThat(ConnectedDriveController.editorSavesAllowed(properties)).isTrue();
        properties.getPremium().getProFeatures().getMicrosoft().setAllowEditorSaves(false);
        assertThat(ConnectedDriveController.editorSavesAllowed(properties)).isFalse();
    }
}
