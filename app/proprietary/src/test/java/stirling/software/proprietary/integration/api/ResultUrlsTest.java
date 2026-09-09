package stirling.software.proprietary.integration.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.net.URI;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import stirling.software.common.model.ApplicationProperties;

/**
 * A result URL is picked by the remote service at run time, so these lean on the ways a hostile or
 * compromised integration might use that to aim a server-side fetch somewhere it should not go.
 */
class ResultUrlsTest {

    private final ApplicationProperties properties = new ApplicationProperties();

    private ApiConnectionSettings connection(List<String> resultUrlHosts) {
        Map<String, Object> config = new LinkedHashMap<>();
        config.put("baseUrl", "https://api.vendor.example/v1");
        if (resultUrlHosts != null) {
            config.put("resultUrlHosts", resultUrlHosts);
        }
        return ApiConnectionSettings.from(config);
    }

    // The host-matching rule is asserted directly: validate() also resolves the host, which fails
    // closed, so it cannot be exercised against reserved .example names without real DNS.

    @Test
    void allowsTheConnectionsOwnHostWithoutBeingDeclared() {
        assertThat(ResultUrls.isAllowedHost(connection(null), "api.vendor.example")).isTrue();
    }

    @Test
    void allowsADeclaredResultHost() {
        // The common real case: the API answers on one host, the file lives on a CDN.
        assertThat(
                        ResultUrls.isAllowedHost(
                                connection(List.of("cdn.vendor.example")), "cdn.vendor.example"))
                .isTrue();
    }

    @Test
    void allowsASubdomainOfADeclaredHost() {
        assertThat(
                        ResultUrls.isAllowedHost(
                                connection(List.of("vendor.example")), "files.eu.vendor.example"))
                .isTrue();
    }

    @Test
    void hostMatchingIsCaseInsensitive() {
        assertThat(
                        ResultUrls.isAllowedHost(
                                connection(List.of("CDN.Vendor.Example")), "cdn.vendor.example"))
                .isTrue();
    }

    @Test
    void anUnresolvableHostIsRefusedRatherThanAssumedSafe() {
        // Fail closed: if we cannot see where a name points, we cannot say it is not internal.
        assertThatThrownBy(
                        () ->
                                ResultUrls.validate(
                                        connection(null),
                                        "https://api.vendor.example/files/signed.pdf",
                                        properties))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Unable to resolve");
    }

    @Test
    void fetchesFromAnAllowedHostThatResolves() {
        properties.getPolicies().setAllowPrivateApiEndpoints(true);
        Map<String, Object> config = new LinkedHashMap<>();
        config.put("baseUrl", "http://127.0.0.1:9000/v1");
        ApiConnectionSettings settings = ApiConnectionSettings.from(config);

        assertThat(
                        ResultUrls.validate(
                                settings, "http://127.0.0.1:9000/files/signed.pdf", properties))
                .isEqualTo(URI.create("http://127.0.0.1:9000/files/signed.pdf"));
    }

    @Test
    void refusesAnUndeclaredHost() {
        assertThatThrownBy(
                        () ->
                                ResultUrls.validate(
                                        connection(null), "https://evil.example/x.pdf", properties))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("does not allow");
    }

    @Test
    void refusesAHostThatMerelyEndsWithADeclaredOne() {
        // "evilvendor.example" must not be admitted by an entry of "vendor.example".
        assertThatThrownBy(
                        () ->
                                ResultUrls.validate(
                                        connection(List.of("vendor.example")),
                                        "https://evilvendor.example/x.pdf",
                                        properties))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("does not allow");
    }

    @Test
    void refusesTheCloudMetadataServiceEvenIfDeclared() {
        // The headline SSRF: an integration answering with the metadata address.
        assertThatThrownBy(
                        () ->
                                ResultUrls.validate(
                                        connection(List.of("169.254.169.254")),
                                        "http://169.254.169.254/latest/meta-data/iam/",
                                        properties))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("private/link-local");
    }

    @Test
    void refusesLoopbackEvenIfDeclared() {
        assertThatThrownBy(
                        () ->
                                ResultUrls.validate(
                                        connection(List.of("localhost")),
                                        "http://localhost:8080/admin",
                                        properties))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void anOperatorCanOptInToPrivateResultHostsForOnPrem() {
        properties.getPolicies().setAllowPrivateApiEndpoints(true);

        assertThat(
                        ResultUrls.validate(
                                connection(List.of("localhost")),
                                "http://localhost:8080/files/signed.pdf",
                                properties))
                .hasHost("localhost");
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "file:///etc/passwd",
                "jar:file:///tmp/x.jar!/y",
                "gopher://evil.example/x",
                "ftp://evil.example/x"
            })
    void refusesNonHttpSchemes(String url) {
        // A URL fetch that accepts file: is a local file read.
        assertThatThrownBy(() -> ResultUrls.validate(connection(null), url, properties))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void refusesCredentialsEmbeddedInTheUrl() {
        assertThatThrownBy(
                        () ->
                                ResultUrls.validate(
                                        connection(List.of("cdn.vendor.example")),
                                        "https://user:pw@cdn.vendor.example/x.pdf",
                                        properties))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("credentials");
    }

    @Test
    void refusesGarbage() {
        assertThatThrownBy(() -> ResultUrls.validate(connection(null), "not a url", properties))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void resultUrlHostsMustBeBareHostnames() {
        // A URL or wildcard here reads as broader than it is.
        assertThatThrownBy(() -> connection(List.of("https://cdn.vendor.example/x")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("bare hostnames");
        assertThatThrownBy(() -> connection(List.of("*.vendor.example")))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
