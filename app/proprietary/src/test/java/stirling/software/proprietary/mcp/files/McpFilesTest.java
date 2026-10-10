package stirling.software.proprietary.mcp.files;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.storage.model.FileShare;
import stirling.software.proprietary.storage.model.ShareAccessRole;
import stirling.software.proprietary.storage.model.StoredFile;
import stirling.software.proprietary.storage.service.FileStorageService;

class McpFilesTest {

    private final FileStorageService storage = mock(FileStorageService.class);
    private final ApplicationProperties props = new ApplicationProperties();
    private final McpFiles files = new McpFiles(storage, mock(UserService.class), props);
    private final User owner = new User();
    private final StoredFile file = new StoredFile();

    @BeforeEach
    void setUp() {
        file.setExpiresAt(LocalDateTime.now().plusHours(1));
        FileShare share = new FileShare();
        share.setShareToken("tok");
        when(storage.canCreateShareLinks()).thenReturn(true);
        when(storage.createShareLink(
                        eq(owner), eq(file), eq(ShareAccessRole.VIEWER), eq(true), any()))
                .thenReturn(share);
    }

    @Test
    void downloadUrl_prefersSystemBackendUrl() {
        props.getSystem().setBackendUrl("https://api.example.com/");
        props.getMcp().getAuth().setResourceId("https://other.example.com/mcp");

        assertEquals(
                "https://api.example.com/api/v1/storage/share-links/tok",
                files.downloadUrl(owner, file));
    }

    @Test
    void downloadUrl_fallsBackToMcpResourceOrigin() {
        props.getMcp().getAuth().setResourceId("https://api.example.com/mcp");

        assertEquals(
                "https://api.example.com/api/v1/storage/share-links/tok",
                files.downloadUrl(owner, file));
    }

    @Test
    void downloadUrl_nullWhenShareLinksOff() {
        when(storage.canCreateShareLinks()).thenReturn(false);

        assertNull(files.downloadUrl(owner, file));
    }
}
