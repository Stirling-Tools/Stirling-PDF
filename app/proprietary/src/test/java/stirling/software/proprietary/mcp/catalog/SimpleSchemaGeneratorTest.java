package stirling.software.proprietary.mcp.catalog;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.HashSet;
import java.util.Set;

import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/** Schema must describe the JSON wire contract, not raw Java field names. */
class SimpleSchemaGeneratorTest {

    private final SimpleSchemaGenerator gen = new SimpleSchemaGenerator(new ObjectMapper());

    @SuppressWarnings("unused")
    static class SampleRequest {
        @JsonProperty("file_name")
        String fileName;

        @JsonProperty(required = true)
        String mode;

        @JsonIgnore String internalSecret;

        boolean flag;

        @jakarta.validation.constraints.NotBlank String title;
    }

    @Test
    void usesJsonPropertyNames_skipsJsonIgnore_marksRequired() {
        ObjectNode schema = gen.toSchema(SampleRequest.class);
        ObjectNode props = (ObjectNode) schema.get("properties");

        assertTrue(props.has("file_name"), "must use the @JsonProperty name");
        assertFalse(props.has("fileName"), "must not emit the raw field name");

        assertFalse(props.has("internalSecret"), "@JsonIgnore field must be skipped");

        assertTrue(props.has("flag"));
        assertEquals("boolean", props.get("flag").get("type").asText());

        assertNotNull(schema.get("required"), "required array expected");
        Set<String> required = new HashSet<>();
        schema.get("required").forEach(n -> required.add(n.asText()));
        assertTrue(required.contains("mode"), "@JsonProperty(required=true) -> required");
        assertTrue(required.contains("title"), "@NotBlank -> required");
        assertFalse(required.contains("file_name"), "optional field not required");
    }
}
