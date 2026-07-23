package stirling.software.proprietary.integration.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.net.URI;

import org.junit.jupiter.api.Test;

import stirling.software.proprietary.integration.api.Placeholders.Escaping;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

class PlaceholdersTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    private ObjectNode context() {
        ObjectNode root = objectMapper.createObjectNode();
        ObjectNode document = root.putObject("document");
        document.put("filename", "invoice.pdf");
        document.put("sha256", "abc123");
        document.put("pageCount", 3);
        document.putNull("title");
        ObjectNode label = root.putObject("sensitivityLabel");
        label.put("name", "Confidential");
        root.putObject("run").put("policyName", "Outbound review");
        return root;
    }

    @Test
    void substitutesADottedPath() {
        assertThat(Placeholders.resolve("{{document.filename}}", context(), Escaping.NONE))
                .isEqualTo("invoice.pdf");
    }

    @Test
    void substitutesSeveralWithSurroundingText() {
        assertThat(
                        Placeholders.resolve(
                                "{{document.filename}} ({{document.pageCount}}p) is"
                                        + " {{sensitivityLabel.name}}",
                                context(),
                                Escaping.NONE))
                .isEqualTo("invoice.pdf (3p) is Confidential");
    }

    @Test
    void toleratesWhitespaceInsideBraces() {
        assertThat(Placeholders.resolve("{{ document.sha256 }}", context(), Escaping.NONE))
                .isEqualTo("abc123");
    }

    @Test
    void aNullValueRendersEmptyNotTheWordNull() {
        // "null" in a vendor's field would read as a value rather than an absence.
        assertThat(Placeholders.resolve("[{{document.title}}]", context(), Escaping.NONE))
                .isEqualTo("[]");
    }

    @Test
    void textWithNoPlaceholderIsUntouched() {
        assertThat(Placeholders.resolve("/scan", context(), Escaping.NONE)).isEqualTo("/scan");
        assertThat(Placeholders.resolve(null, context(), Escaping.NONE)).isNull();
    }

    @Test
    void anUnknownPathIsAnErrorRatherThanAnEmptyValue() {
        // A typo that silently sent "" could mean an external system files a document wrongly.
        assertThatThrownBy(
                        () -> Placeholders.resolve("{{document.nope}}", context(), Escaping.NONE))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("unknown placeholder");
        assertThatThrownBy(() -> Placeholders.resolve("{{nope.at.all}}", context(), Escaping.NONE))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void anObjectRendersAsJson() {
        assertThat(Placeholders.resolve("{{sensitivityLabel}}", context(), Escaping.NONE))
                .isEqualTo("{\"name\":\"Confidential\"}");
    }

    @Test
    void pathEscapingEncodesSeparatorsButNotDots() {
        ObjectNode context = context();
        context.putObject("x").put("weird", "a/b c.pdf");

        // The dot survives (it is unreserved); the slash and space cannot pass as structure.
        assertThat(Placeholders.resolve("{{x.weird}}", context, Escaping.URL_PATH))
                .isEqualTo("a%2Fb%20c.pdf");
    }

    @Test
    void aTraversalInAValueIsNeutralisedRatherThanObeyed() {
        ObjectNode context = context();
        context.putObject("x").put("nasty", "../../admin");

        // Encoding the separators leaves one inert segment, so there is no traversal left to
        // normalise: the request stays under the base and the value arrives as data.
        String resolved = Placeholders.resolve("/docs/{{x.nasty}}", context, Escaping.URL_PATH);
        assertThat(resolved).isEqualTo("/docs/..%2F..%2Fadmin");

        assertThat(ExternalApiPaths.resolve(URI.create("https://api.example.com/v1"), resolved))
                .isEqualTo(URI.create("https://api.example.com/v1/docs/..%2F..%2Fadmin"));
    }

    @Test
    void aTraversalWrittenIntoTheTemplateItselfIsStillRejected() {
        // The operator's own text is not encoded, so a literal ".." normalises and the base check
        // sees it. This is why dots are deliberately left unencoded above.
        assertThatThrownBy(
                        () ->
                                ExternalApiPaths.resolve(
                                        URI.create("https://api.example.com/v1"), "/docs/../../x"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("escapes");
    }

    @Test
    void detectsWhetherTextReferencesAnything() {
        assertThat(Placeholders.hasPlaceholder("{{a.b}}")).isTrue();
        assertThat(Placeholders.hasPlaceholder("plain")).isFalse();
        assertThat(Placeholders.hasPlaceholder(null)).isFalse();
    }
}
