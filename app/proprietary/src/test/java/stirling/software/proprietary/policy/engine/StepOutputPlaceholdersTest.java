package stirling.software.proprietary.policy.engine;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * Unit tests for {@link StepOutputPlaceholders}: it resolves only {@code steps.*} references and
 * leaves every other placeholder for the downstream tool, so the pipeline-scope and document-scope
 * passes never collide.
 */
class StepOutputPlaceholdersTest {

    private final ObjectMapper mapper = JsonMapper.builder().build();

    /** A run context whose step 1 reported a share url, matching the executor's shape. */
    private ObjectNode contextWithStep1Url(String url) {
        ObjectNode root = mapper.createObjectNode();
        ObjectNode body = root.putObject("steps").putObject("1").putObject("body");
        body.put("url", url);
        return root;
    }

    @Test
    void resolvesAStepReference() {
        ObjectNode ctx = contextWithStep1Url("https://share/abc");
        assertEquals(
                "see https://share/abc",
                StepOutputPlaceholders.resolve("see {{steps.1.body.url}}", ctx));
    }

    @Test
    void leavesDocumentAndRunPlaceholdersUntouched() {
        ObjectNode ctx = contextWithStep1Url("u");
        String template = "{{document.filename}} by {{run.policyName}}";
        assertEquals(template, StepOutputPlaceholders.resolve(template, ctx));
    }

    @Test
    void resolvesStepsAndLeavesTheRestInOneString() {
        ObjectNode ctx = contextWithStep1Url("https://s/1");
        assertEquals(
                "https://s/1 for {{document.filename}}",
                StepOutputPlaceholders.resolve(
                        "{{steps.1.body.url}} for {{document.filename}}", ctx));
    }

    @Test
    void throwsWhenStepReferenceIsMissing() {
        ObjectNode ctx = contextWithStep1Url("u");
        IllegalArgumentException ex =
                assertThrows(
                        IllegalArgumentException.class,
                        () -> StepOutputPlaceholders.resolve("{{steps.2.body.url}}", ctx));
        assertTrue(ex.getMessage().contains("steps.2.body.url"));
    }

    @Test
    void throwsWhenStepReferenceIsNotScalar() {
        ObjectNode ctx = contextWithStep1Url("u");
        // steps.1.body is an object; it cannot be inlined into a string parameter.
        assertThrows(
                IllegalArgumentException.class,
                () -> StepOutputPlaceholders.resolve("{{steps.1.body}}", ctx));
    }

    @Test
    void referencesDetectsStepsOnly() {
        assertTrue(StepOutputPlaceholders.references("x {{steps.1.a}}"));
        assertFalse(StepOutputPlaceholders.references("{{document.filename}}"));
        assertFalse(StepOutputPlaceholders.references("no refs"));
        assertFalse(StepOutputPlaceholders.references(null));
    }

    @Test
    void nullAndEmptyPassThrough() {
        ObjectNode ctx = contextWithStep1Url("u");
        assertNull(StepOutputPlaceholders.resolve(null, ctx));
        assertEquals("", StepOutputPlaceholders.resolve("", ctx));
    }
}
