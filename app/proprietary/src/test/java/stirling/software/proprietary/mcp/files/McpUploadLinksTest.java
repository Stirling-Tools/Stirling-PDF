package stirling.software.proprietary.mcp.files;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.common.cluster.inprocess.InProcessKeyValueCache;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;

import tools.jackson.databind.ObjectMapper;

class McpUploadLinksTest {

    private final McpFiles files = mock(McpFiles.class);
    private final UserService users = mock(UserService.class);
    private final User alice = new User();
    private McpUploadLinks links;
    private McpUploadController controller;

    @BeforeEach
    void setUp() throws Exception {
        when(files.publicBaseUrl()).thenReturn("https://pdf.example.com");
        when(users.findByUsernameIgnoreCase("alice")).thenReturn(Optional.of(alice));
        when(files.save(eq(alice), any(), anyString(), any(), anyLong(), eq(false)))
                .thenReturn(
                        new McpFiles.Saved(
                                "42", "big.pdf", "application/pdf", 3, null, null, false, null));
        links = new McpUploadLinks(new InProcessKeyValueCache(), new ObjectMapper(), files);
        controller = new McpUploadController(links, files, users);
    }

    private static MockMultipartFile pdf() {
        return new MockMultipartFile("file", "big.pdf", "application/pdf", new byte[] {1, 2, 3});
    }

    @Test
    void aLinkTakesOneFileForItsOwnerAndThenReportsTheFileId() {
        McpUploadLinks.Link link = links.create("alice");
        assertTrue(link.url().startsWith("https://pdf.example.com/api/v1/mcp/uploads/"));
        assertFalse(links.status(link.uploadId(), "alice").uploaded() != null);

        ResponseEntity<?> response = controller.upload(link.uploadId(), pdf(), "*/*");

        assertEquals(200, response.getStatusCode().value());
        assertTrue(response.getBody().toString().contains("42"), response.getBody().toString());
        McpUploadLinks.Status status = links.status(link.uploadId(), "alice");
        assertTrue(status.known());
        assertEquals("42", status.uploaded().fileId());
    }

    @Test
    void aUsedLinkRefusesASecondFile() throws Exception {
        McpUploadLinks.Link link = links.create("alice");
        controller.upload(link.uploadId(), pdf(), "*/*");

        ResponseEntity<?> second = controller.upload(link.uploadId(), pdf(), "*/*");

        assertEquals(404, second.getStatusCode().value());
        verify(files).save(eq(alice), any(), anyString(), any(), anyLong(), eq(false));
    }

    @Test
    void unknownOrMalformedTokensSaveNothing() throws Exception {
        assertEquals(404, controller.upload("not-a-token", pdf(), "*/*").getStatusCode().value());
        assertEquals(
                404, controller.upload("A".repeat(43), pdf(), "text/html").getStatusCode().value());
        verify(files, never()).save(any(), any(), anyString(), any(), anyLong(), eq(false));
    }

    @Test
    void anotherUserCannotSeeTheLink() {
        McpUploadLinks.Link link = links.create("alice");

        McpUploadLinks.Status status = links.status(link.uploadId(), "mallory");

        assertFalse(status.known());
        assertNull(status.uploaded());
    }

    @Test
    void openingThePageDoesNotUseTheLinkUpAndTheNameIsEscaped() throws Exception {
        when(files.save(eq(alice), any(), anyString(), any(), anyLong(), eq(false)))
                .thenReturn(
                        new McpFiles.Saved(
                                "7",
                                "<b>x</b>.pdf",
                                "application/pdf",
                                3,
                                null,
                                null,
                                false,
                                null));
        McpUploadLinks.Link link = links.create("alice");

        assertTrue(controller.page(link.uploadId()).getBody().contains("type=\"file\""));
        assertTrue(links.isOpen(link.uploadId()));
        controller.upload(link.uploadId(), pdf(), "text/html");

        String done = controller.page(link.uploadId()).getBody();
        assertTrue(done.contains("&lt;b&gt;x&lt;/b&gt;.pdf"), done);
        assertEquals(404, controller.page("A".repeat(43)).getStatusCode().value());
    }
}
