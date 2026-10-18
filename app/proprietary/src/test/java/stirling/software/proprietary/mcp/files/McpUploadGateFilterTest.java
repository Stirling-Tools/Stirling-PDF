package stirling.software.proprietary.mcp.files;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.concurrent.atomic.AtomicBoolean;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import stirling.software.common.cluster.inprocess.InProcessDistributedLock;
import stirling.software.common.cluster.inprocess.InProcessKeyValueCache;

import tools.jackson.databind.ObjectMapper;

class McpUploadGateFilterTest {

    private McpUploadLinks links;
    private McpUploadGateFilter filter;

    @BeforeEach
    void setUp() {
        McpFiles files = mock(McpFiles.class);
        when(files.publicBaseUrl()).thenReturn("https://pdf.example.com");
        links =
                new McpUploadLinks(
                        new InProcessKeyValueCache(),
                        new ObjectMapper(),
                        files,
                        new InProcessDistributedLock());
        filter = new McpUploadGateFilter(links, new ObjectMapper());
    }

    private boolean passes(MockHttpServletRequest request, MockHttpServletResponse response)
            throws Exception {
        AtomicBoolean reached = new AtomicBoolean();
        filter.doFilter(request, response, (req, res) -> reached.set(true));
        return reached.get();
    }

    private static MockHttpServletRequest post(String token) {
        MockHttpServletRequest request =
                new MockHttpServletRequest("POST", McpUploadLinks.PATH + token);
        request.setContentType("multipart/form-data; boundary=x");
        request.setContent(new byte[1024]);
        return request;
    }

    @Test
    void anUnknownTokenIsRejectedWithoutReadingTheBody() throws Exception {
        MockHttpServletRequest request = post("A".repeat(43));
        MockHttpServletResponse response = new MockHttpServletResponse();

        assertFalse(passes(request, response));
        assertEquals(404, response.getStatus());
        assertEquals("close", response.getHeader("Connection"));
        assertEquals(1024, request.getInputStream().available());
    }

    @Test
    void aMalformedTokenIsRejected() throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();
        assertFalse(passes(post("../../etc"), response));
        assertEquals(404, response.getStatus());
    }

    @Test
    void anOpenLinkReachesTheController() throws Exception {
        String token = links.create("alice").uploadId();
        assertTrue(passes(post(token), new MockHttpServletResponse()));
    }

    @Test
    void aUsedLinkIsRejectedAndBrowsersGetThePage() throws Exception {
        String token = links.create("alice").uploadId();
        links.claim(token);
        MockHttpServletRequest request = post(token);
        request.addHeader("Accept", "text/html");
        MockHttpServletResponse response = new MockHttpServletResponse();

        assertFalse(passes(request, response));
        assertEquals(404, response.getStatus());
        assertTrue(response.getContentAsString().contains("This link has expired"));
    }

    @Test
    void otherRequestsAreLeftAlone() throws Exception {
        MockHttpServletRequest page =
                new MockHttpServletRequest("GET", McpUploadLinks.PATH + "A".repeat(43));
        assertTrue(passes(page, new MockHttpServletResponse()));
        assertTrue(
                passes(
                        new MockHttpServletRequest("POST", "/api/v1/general/merge-pdfs"),
                        new MockHttpServletResponse()));
    }
}
