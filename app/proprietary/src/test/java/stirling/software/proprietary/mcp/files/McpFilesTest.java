package stirling.software.proprietary.mcp.files;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.InputStream;
import java.time.LocalDateTime;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.FileStorage;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.storage.model.FileShare;
import stirling.software.proprietary.storage.model.ShareAccessRole;
import stirling.software.proprietary.storage.model.StoredFile;
import stirling.software.proprietary.storage.service.FileStorageService;

class McpFilesTest {

    private static final byte[] PDF = "PDF".getBytes();

    private final FileStorageService storage = mock(FileStorageService.class);
    private final FileStorage tempStore = mock(FileStorage.class);
    private final ApplicationProperties props = new ApplicationProperties();
    private final McpFiles files = new McpFiles(storage, tempStore, mock(UserService.class), props);
    private final User owner = new User();
    private final StoredFile file = new StoredFile();

    @BeforeEach
    void setUp() throws Exception {
        props.getSecurity().setEnableLogin(true);
        props.getSystem().setFrontendUrl("https://app.example.com/");
        file.setId(7L);
        file.setOriginalFilename("out.pdf");
        file.setContentType("application/pdf");
        file.setSizeBytes(PDF.length);
        file.setExpiresAt(LocalDateTime.now().plusHours(1));
        FileShare share = new FileShare();
        share.setShareToken("tok");
        when(storage.canCreateShareLinks()).thenReturn(true);
        when(storage.createShareLink(
                        eq(owner), eq(file), eq(ShareAccessRole.VIEWER), anyBoolean(), any()))
                .thenReturn(share);
        when(storage.createShareLink(
                        eq(owner), eq(file), eq(ShareAccessRole.VIEWER), any(), eq(owner)))
                .thenReturn(share);
        when(storage.storeTemporaryFile(eq(owner), any(), any())).thenReturn(file);
        when(tempStore.storeInputStream(any(InputStream.class), anyString()))
                .thenReturn(new FileStorage.StoredFile("tmp-1", PDF.length));
    }

    @Test
    void save_defaultsToStoredFileWithPrivateLinkAndNoInline() throws Exception {
        McpFiles.Saved saved = files.save(owner, PDF, "out.pdf", "application/pdf", true);

        assertEquals("7", saved.fileId());
        assertEquals("https://app.example.com/share/tok?action=download", saved.downloadUrl());
        assertEquals("https://app.example.com/share/tok?action=open", saved.openUrl());
        assertTrue(saved.privateLink());
        assertNull(saved.inline());
        // Private links open for their owner only.
        verify(storage)
                .createShareLink(eq(owner), eq(file), eq(ShareAccessRole.VIEWER), any(), eq(owner));
    }

    @Test
    void save_publicLinksUseTheAnonymousDownloadEndpoint() throws Exception {
        props.getMcp().setDownloadLinks("public");
        props.getSystem().setBackendUrl("https://api.example.com/");

        McpFiles.Saved saved = files.save(owner, PDF, "out.pdf", "application/pdf", true);

        assertEquals("https://api.example.com/api/v1/storage/share-links/tok", saved.downloadUrl());
        assertEquals("https://app.example.com/share/tok?action=open", saved.openUrl());
        assertFalse(saved.privateLink());
        verify(storage)
                .createShareLink(eq(owner), eq(file), eq(ShareAccessRole.VIEWER), eq(true), any());
    }

    @Test
    void save_publicLinksFallBackToMcpResourceOrigin() throws Exception {
        props.getMcp().setDownloadLinks("public");
        props.getMcp().getAuth().setResourceId("https://api.example.com/mcp");

        McpFiles.Saved saved = files.save(owner, PDF, "out.pdf", "application/pdf", true);

        assertEquals("https://api.example.com/api/v1/storage/share-links/tok", saved.downloadUrl());
    }

    @Test
    void save_linksOffOrUnavailableGiveNoLink() throws Exception {
        props.getMcp().setDownloadLinks("off");
        assertNull(files.save(owner, PDF, "out.pdf", "application/pdf", true).downloadUrl());

        props.getMcp().setDownloadLinks("private");
        when(storage.canCreateShareLinks()).thenReturn(false);
        assertNull(files.save(owner, PDF, "out.pdf", "application/pdf", true).downloadUrl());
    }

    @Test
    void save_inlinesTheResultWhenNoLinkCanBeMade() throws Exception {
        when(storage.canCreateShareLinks()).thenReturn(false);

        McpFiles.Saved saved = files.save(owner, PDF, "out.pdf", "application/pdf", true);

        assertNull(saved.downloadUrl());
        assertArrayEquals(PDF, saved.inline());
    }

    @Test
    void save_uploadsGetNoLink() throws Exception {
        McpFiles.Saved saved = files.save(owner, PDF, "in.pdf", "application/pdf", false);

        assertNull(saved.downloadUrl());
        verify(storage, never()).createShareLink(any(), any(), any(), anyBoolean(), any());
        verify(storage, never())
                .createShareLink(any(), any(), any(), any(LocalDateTime.class), any());
    }

    @Test
    void save_inlineAlwaysAddsBytesToStoredResult() throws Exception {
        props.getMcp().setInlineResults("always");

        assertArrayEquals(PDF, files.save(owner, PDF, "out.pdf", "application/pdf", true).inline());
    }

    @Test
    void save_withoutStorageUsesTempStoreAndInlines() throws Exception {
        props.getStorage().setEnabled(false);

        McpFiles.Saved saved = files.save(owner, PDF, "out.pdf", "application/pdf", true);

        assertEquals("tmp-1", saved.fileId());
        assertNull(saved.downloadUrl());
        assertArrayEquals(PDF, saved.inline());
        verify(storage, never()).storeTemporaryFile(any(), any(), any());
    }

    @Test
    void save_unboundAccountOrLoginOffUsesTempStore() throws Exception {
        assertEquals("tmp-1", files.save(null, PDF, "out.pdf", "application/pdf", true).fileId());

        props.getSecurity().setEnableLogin(false);
        assertEquals("tmp-1", files.save(owner, PDF, "out.pdf", "application/pdf", true).fileId());
    }

    @Test
    void save_storeResultsOffUsesTempStoreButInlineNeverIsHonoured() throws Exception {
        props.getMcp().setStoreResults(false);
        props.getMcp().setInlineResults("never");

        McpFiles.Saved saved = files.save(owner, PDF, "out.pdf", "application/pdf", true);

        assertEquals("tmp-1", saved.fileId());
        assertNull(saved.inline());
    }

    @Test
    void save_inlineSkippedOverTheSizeLimit() throws Exception {
        props.getStorage().setEnabled(false);
        props.getMcp().setMaxInlineResponseBytes(2);

        assertNull(files.save(owner, PDF, "out.pdf", "application/pdf", true).inline());
    }

    @Test
    void load_tempStoreIdsStillWorkWhenStorageIsOn() throws Exception {
        when(tempStore.fileExists("tmp-1")).thenReturn(true);
        when(tempStore.retrieveBytes("tmp-1")).thenReturn(PDF);

        McpFiles.Loaded loaded = files.load(owner, "tmp-1");

        assertArrayEquals(PDF, loaded.bytes());
        verify(storage, never()).getAccessibleFile(any(), any());
    }

    @Test
    void load_unknownTempIdIsReported() {
        when(tempStore.fileExists("nope")).thenReturn(false);

        McpFiles.McpFileException e =
                assertThrows(McpFiles.McpFileException.class, () -> files.load(owner, "nope"));
        assertTrue(e.getMessage().contains("Unknown or expired"));
    }
}
