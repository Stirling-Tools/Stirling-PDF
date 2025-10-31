package stirling.software.SPDF.model;

import static org.junit.jupiter.api.Assertions.*;

import java.util.HashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

class ApiEndpointTest {

    private final ObjectMapper mapper = new ObjectMapper();

    private JsonNode postNodeWithParams(String description, String... names) {
        ObjectNode post = mapper.createObjectNode();
        post.put("description", description);
        ArrayNode params = mapper.createArrayNode();
        for (String n : names) {
            ObjectNode p = mapper.createObjectNode();
            if (n != null) {
                p.put("name", n);
            }
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
    void toString_contains_name_and_parameter_names() {
        JsonNode post = postNodeWithParams("desc", "file", "mode");
        ApiEndpoint endpoint = new ApiEndpoint("pdfToMd", post);

        String s = endpoint.toString();
        assertTrue(s.contains("pdfToMd"));
        assertTrue(s.contains("file"));
        assertTrue(s.contains("mode"));
    }
}
