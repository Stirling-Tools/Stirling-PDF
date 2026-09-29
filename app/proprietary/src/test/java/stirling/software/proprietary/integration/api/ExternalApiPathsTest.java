package stirling.software.proprietary.integration.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.net.URI;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * {@link ExternalApiPaths} is the control that stops the external-API step becoming an SSRF
 * primitive, so these lean on the ways a step author might try to leave the connection's base URL.
 */
class ExternalApiPathsTest {

    private static final URI BASE = URI.create("https://api.example.com/v1");

    @Nested
    @DisplayName("resolves paths under the base")
    class Resolves {

        @Test
        void appendsARelativePath() {
            assertThat(ExternalApiPaths.resolve(BASE, "/scan"))
                    .isEqualTo(URI.create("https://api.example.com/v1/scan"));
        }

        @Test
        void addsTheLeadingSlashWhenOmitted() {
            assertThat(ExternalApiPaths.resolve(BASE, "scan"))
                    .isEqualTo(URI.create("https://api.example.com/v1/scan"));
        }

        @Test
        void blankPathIsTheBaseItself() {
            assertThat(ExternalApiPaths.resolve(BASE, "  ")).isEqualTo(BASE);
            assertThat(ExternalApiPaths.resolve(BASE, null)).isEqualTo(BASE);
        }

        @Test
        void keepsAQueryString() {
            assertThat(ExternalApiPaths.resolve(BASE, "/scan?mode=strict"))
                    .isEqualTo(URI.create("https://api.example.com/v1/scan?mode=strict"));
        }

        @Test
        void allowsATraversalThatStaysUnderTheBase() {
            // "/v1/a/../b" normalises to "/v1/b", which is still under the base.
            assertThat(ExternalApiPaths.resolve(BASE, "/a/../b"))
                    .isEqualTo(URI.create("https://api.example.com/v1/b"));
        }

        @Test
        void baseWithNoPathAcceptsAnyPath() {
            assertThat(ExternalApiPaths.resolve(URI.create("https://api.example.com"), "/scan"))
                    .isEqualTo(URI.create("https://api.example.com/scan"));
        }

        @Test
        void keepsAnEncodedSlashFromASubstitutedValue() {
            // Placeholders percent-encodes what it substitutes, so a filename containing '/'
            // arrives as %2F. That is data inside one segment and must survive.
            assertThat(ExternalApiPaths.resolve(BASE, "/docs/my%2Ffile.pdf"))
                    .isEqualTo(URI.create("https://api.example.com/v1/docs/my%2Ffile.pdf"));
        }
    }

    @Nested
    @DisplayName("refuses to leave the base")
    class Refuses {

        @Test
        void protocolRelativeUrlCannotChangeHost() {
            // The reason URI.resolve is not used: it would yield https://evil.example/x here.
            assertThatThrownBy(() -> ExternalApiPaths.resolve(BASE, "//evil.example/x"))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("must be relative");
        }

        @ParameterizedTest
        @ValueSource(
                strings = {
                    "https://evil.example/x",
                    "http://evil.example/x",
                    "HTTPS://evil.example/x",
                    "file:///etc/passwd"
                })
        void absoluteUrlIsRejected(String path) {
            assertThatThrownBy(() -> ExternalApiPaths.resolve(BASE, path))
                    .isInstanceOf(IllegalArgumentException.class);
        }

        @Test
        void traversalAboveTheBasePathIsRejected() {
            assertThatThrownBy(() -> ExternalApiPaths.resolve(BASE, "/../admin"))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("escapes");
        }

        @Test
        void percentEncodedTraversalIsRejected() {
            // normalize() would not decode these, so the target server would do the escaping.
            assertThatThrownBy(() -> ExternalApiPaths.resolve(BASE, "/%2e%2e/admin"))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("percent-encode");
        }

        @ParameterizedTest
        @ValueSource(strings = {"/scan\r\nX-Injected: 1", "/scan\nfoo", "/sc an", "/scan\\..\\x"})
        void requestSplittingCharactersAreRejected(String path) {
            assertThatThrownBy(() -> ExternalApiPaths.resolve(BASE, path))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("illegal character");
        }

        @Test
        void siblingPathThatMerelySharesAPrefixIsRejected() {
            // "/v1betray" starts with "/v1" textually but is a different resource tree.
            assertThatThrownBy(() -> ExternalApiPaths.resolve(BASE, "/../v1betray/x"))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("escapes");
        }

        @Test
        void fragmentIsRejected() {
            assertThatThrownBy(() -> ExternalApiPaths.resolve(BASE, "/scan#frag"))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("fragment");
        }
    }
}
