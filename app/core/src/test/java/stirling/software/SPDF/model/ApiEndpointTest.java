package stirling.software.SPDF.model;

import static org.junit.jupiter.api.Assertions.*;

import java.util.HashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

class ApiEndpointTest {

    private final ObjectMapper mapper = JsonMapper.builder().build();

    private JsonNode postNodeWithParams(String description, String... names) {
        return postNodeWithParams(description, true, names);
    }

    private JsonNode postNodeWithParams(
            String description, boolean required, String... names) {
        ObjectNode post = mapper.createObjectNode();
        post.put("description", description);
        ArrayNode params = mapper.createArrayNode();
        for (String n : names) {
            ObjectNode p = mapper.createObjectNode();
            if (n != null) {
                p.put("name", n);
            }
            p.put("required", required);
            params.add(p);
        }
        post.set("parameters", params);
        return post;
    }

    @Test
    void parses_description_and_validates_required_parameters() {
        JsonNode post = postNodeWithParams("Convert PDF to Markdown", "file", "mode");
        ApiEndpoint endpoint = new ApiEndpoint("pdfToMd", post);

        assertEquals("Convert PDF to Markdown", endpoint.getDescription());

        Map<String, Object> provided = new HashMap<>();
        provided.put("file", new byte[] {1});
        provided.put("mode", "fast");

        assertTrue(
                endpoint.areParametersValid(provided), "All required keys present should be valid");
    }

    @Test
    void missing_any_required_parameter_returns_false() {
        JsonNode post = postNodeWithParams("desc", "file", "mode");
        ApiEndpoint endpoint = new ApiEndpoint("pdfToMd", post);

        Map<String, Object> provided = new HashMap<>();
        provided.put("file", new byte[] {1});

        assertFalse(endpoint.areParametersValid(provided));
    }

    @Test
    void extra_parameters_are_ignored_if_required_are_present() {
        JsonNode post = postNodeWithParams("desc", "file");
        ApiEndpoint endpoint = new ApiEndpoint("x", post);

        Map<String, Object> provided = new HashMap<>();
        provided.put("file", new byte[] {1});
        provided.put("extra", 123);

        assertTrue(endpoint.areParametersValid(provided));
    }

    @Test
    void no_parameters_defined_accepts_empty_input() {
        JsonNode postEmptyArray = postNodeWithParams("desc" /* no names */);
        ApiEndpoint endpointA = new ApiEndpoint("a", postEmptyArray);
        assertTrue(endpointA.areParametersValid(Map.of()));

        ObjectNode postNoField = mapper.createObjectNode();
        postNoField.put("description", "desc");
        ApiEndpoint endpointB = new ApiEndpoint("b", postNoField);
        assertTrue(endpointB.areParametersValid(Map.of()));
    }

    @Test
    void parameter_without_name_creates_empty_required_key() {
        JsonNode post = postNodeWithParams("desc", (String) null);
        ApiEndpoint endpoint = new ApiEndpoint("y", post);

        assertFalse(endpoint.areParametersValid(Map.of()));

        assertTrue(endpoint.areParametersValid(Map.of("", 42)));
    }

    @Test
    void optional_parameters_can_be_omitted() {
        JsonNode post = postNodeWithParams("desc", false, "fileOrder");
        ApiEndpoint endpoint = new ApiEndpoint("merge", post);

        assertTrue(
                endpoint.areParametersValid(Map.of()),
                "Should be valid when optional param is omitted");
    }

    @Test
    void mixed_required_and_optional_validates_only_required() {
        ObjectNode post = mapper.createObjectNode();
        post.put("description", "merge pdfs");
        ArrayNode params = mapper.createArrayNode();

        ObjectNode required = mapper.createObjectNode();
        required.put("name", "sortType");
        required.put("required", true);
        params.add(required);

        ObjectNode optional = mapper.createObjectNode();
        optional.put("name", "fileOrder");
        optional.put("required", false);
        params.add(optional);

        post.set("parameters", params);
        ApiEndpoint endpoint = new ApiEndpoint("/api/v1/general/merge-pdfs", post);

        Map<String, Object> provided = new HashMap<>();
        provided.put("sortType", "byFileName");

        assertTrue(
                endpoint.areParametersValid(provided),
                "Should pass when required params present and optional omitted");

        provided.put("fileOrder", "0,1,2");
        assertTrue(
                endpoint.areParametersValid(provided),
                "Should also pass when optional param is provided");
    }

    @Test
    void missing_required_param_with_optional_present_still_fails() {
        ObjectNode post = mapper.createObjectNode();
        post.put("description", "desc");
        ArrayNode params = mapper.createArrayNode();

        ObjectNode required = mapper.createObjectNode();
        required.put("name", "file");
        required.put("required", true);
        params.add(required);

        ObjectNode optional = mapper.createObjectNode();
        optional.put("name", "fileOrder");
        optional.put("required", false);
        params.add(optional);

        post.set("parameters", params);
        ApiEndpoint endpoint = new ApiEndpoint("x", post);

        Map<String, Object> provided = new HashMap<>();
        provided.put("fileOrder", "0,1");

        assertFalse(
                endpoint.areParametersValid(provided),
                "Should fail when required param is missing even if optional is present");
    }

    @Test
    void toString_contains_name_and_parameter_names() {
        JsonNode post = postNodeWithParams("desc", "file", "mode");
        ApiEndpoint endpoint = new ApiEndpoint("pdfToMd", post);

        String s = endpoint.toString();
        assertTrue(s.contains("pdfToMd"));
        assertTrue(s.contains("file"));
        assertTrue(s.contains("mode"));
    }
}
