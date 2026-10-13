package stirling.software.proprietary.mcp.files;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.nio.file.Path;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.common.cluster.inprocess.InProcessDistributedLock;
import stirling.software.common.cluster.inprocess.InProcessKeyValueCache;
import stirling.software.common.cluster.inprocess.LocalDiskFileStore;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.FileOrUploadService;
import stirling.software.common.service.FileStorage;
import stirling.software.common.service.JobOwnershipService;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.storage.service.FileStorageService;

import tools.jackson.databind.ObjectMapper;

class McpUploadOwnershipTest {
    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void aLinkUploadKeepsItsOwnerWithoutStoredFiles(boolean storageEnabled, @TempDir Path dir)
            throws Exception {
        var current = new AtomicReference<String>();
        var ownership = mock(JobOwnershipService.class);
        when(ownership.getCurrentUserId()).thenAnswer(i -> Optional.ofNullable(current.get()));
        var store = new LocalDiskFileStore(dir.toString());
        var temp = new FileStorage(mock(FileOrUploadService.class), store, Optional.of(ownership));
        var props = new ApplicationProperties();
        props.getSecurity().setEnableLogin(true);
        props.getStorage().setEnabled(storageEnabled);
        props.getMcp().setStoreResults(false);
        props.getSystem().setBackendUrl("https://pdf.example.com");
        var users = mock(UserService.class);
        var alice = new User();
        alice.setUsername("alice");
        var bob = new User();
        bob.setUsername("bob");
        when(users.findByUsernameIgnoreCase("alice")).thenReturn(Optional.of(alice));
        var files = new McpFiles(mock(FileStorageService.class), temp, users, props);
        var links =
                new McpUploadLinks(
                        new InProcessKeyValueCache(),
                        new ObjectMapper(),
                        files,
                        new InProcessDistributedLock());
        var controller = new McpUploadController(links, files, users);
        var link = links.create("alice");
        byte[] secret = "alice-private-document".getBytes(java.nio.charset.StandardCharsets.UTF_8);
        var response =
                controller.upload(
                        link.uploadId(),
                        new MockMultipartFile("file", "private.pdf", "application/pdf", secret),
                        "*/*");
        assertEquals(200, response.getStatusCode().value());
        String id = ((Map<?, ?>) response.getBody()).get("fileId").toString();
        assertEquals("alice", store.getOwner(id));
        current.set("bob");
        assertThrows(McpFiles.McpFileException.class, () -> files.load(bob, id));
        current.set("alice");
        assertArrayEquals(secret, files.load(alice, id).bytes());
    }
}
