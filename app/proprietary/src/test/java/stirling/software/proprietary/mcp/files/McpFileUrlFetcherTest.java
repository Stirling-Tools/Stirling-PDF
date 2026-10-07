package stirling.software.proprietary.mcp.files;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.junit.jupiter.api.Test;

import stirling.software.common.model.ApplicationProperties;

class McpFileUrlFetcherTest {

    private final McpFileUrlFetcher fetcher = new McpFileUrlFetcher(new ApplicationProperties());

    @Test
    void hostSuffixMatchIsOnLabelBoundaries() {
        List<String> allowed = List.of("oaiusercontent.com");
        assertTrue(McpFileUrlFetcher.isAllowedHost("oaiusercontent.com", allowed));
        assertTrue(McpFileUrlFetcher.isAllowedHost("files.OAIUSERCONTENT.com", allowed));
        assertFalse(McpFileUrlFetcher.isAllowedHost("evil-oaiusercontent.com", allowed));
        assertFalse(McpFileUrlFetcher.isAllowedHost("oaiusercontent.com.evil.io", allowed));
        assertFalse(McpFileUrlFetcher.isAllowedHost("anything.com", List.of()));
    }

    @Test
    void rejectsNonHttpsAndUnlistedHosts() {
        assertThrows(
                McpFileUrlFetcher.FetchException.class,
                () -> fetcher.requireAllowed("http://files.oaiusercontent.com/x"));
        assertThrows(
                McpFileUrlFetcher.FetchException.class,
                () -> fetcher.requireAllowed("https://169.254.169.254/latest/meta-data"));
        assertThrows(
                McpFileUrlFetcher.FetchException.class,
                () -> fetcher.requireAllowed("file:///etc/passwd"));
        assertThrows(McpFileUrlFetcher.FetchException.class, () -> fetcher.requireAllowed("::"));
    }

    @Test
    void rejectsAllowlistedNameResolvingToPrivateAddress() {
        ApplicationProperties props = new ApplicationProperties();
        props.getMcp().setFileUrlAllowedHosts(List.of("localhost"));
        McpFileUrlFetcher local = new McpFileUrlFetcher(props);
        assertThrows(
                McpFileUrlFetcher.FetchException.class,
                () -> local.requireAllowed("https://localhost/x"));
    }
}
