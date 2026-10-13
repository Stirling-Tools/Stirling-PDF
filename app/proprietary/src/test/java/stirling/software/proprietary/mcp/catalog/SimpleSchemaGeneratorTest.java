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

        @io.swagger.v3.oas.annotations.media.Schema(format = "password")
        String password;

        @io.swagger.v3.oas.annotations.media.Schema(
                description = "Stamp opacity",
                defaultValue = "0.5",
                minimum = "0",
                maximum = "1")
        float opacity;

        @io.swagger.v3.oas.annotations.media.Schema(
                allowableValues = {"small", "medium", "large"},
                defaultValue = "medium",
                requiredMode = io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED)
        String customMargin;

        @io.swagger.v3.oas.annotations.media.Schema(
                requiredMode = io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED)
        String stampText;

        @io.swagger.v3.oas.annotations.media.Schema(hidden = true)
        String internalOnly;
    }

    @Test
    void schemaAnnotationsBecomeDefaultsEnumsBoundsAndRequired() {
        ObjectNode schema = gen.toSchema(SampleRequest.class);
        ObjectNode props = (ObjectNode) schema.get("properties");

        assertEquals("Stamp opacity", props.get("opacity").get("description").asText());
        assertEquals(0.5, props.get("opacity").get("default").asDouble());
        assertEquals(1.0, props.get("opacity").get("maximum").asDouble());
        assertEquals("medium", props.get("customMargin").get("default").asText());
        assertEquals(3, props.get("customMargin").get("enum").size());
        assertFalse(props.has("internalOnly"), "hidden fields stay out");

        Set<String> required = new HashSet<>();
        schema.get("required").forEach(n -> required.add(n.asText()));
        assertTrue(required.contains("stampText"), "requiredMode REQUIRED -> required");
        assertFalse(required.contains("customMargin"), "a field with a default is never required");
    }

    enum Mode {
        FIRST,
        SECOND
    }

    @SuppressWarnings("unused")
    static class DocumentedRequest {
        @io.swagger.v3.oas.annotations.media.Schema(
                description = "The PKCS12 keystore (required for PKCS12)")
        org.springframework.web.multipart.MultipartFile p12File;

        @io.swagger.v3.oas.annotations.media.Schema(
                description = "How to sort",
                implementation = Mode.class)
        String customMode;

        @io.swagger.v3.oas.annotations.media.Schema(defaultValue = "[\"eng\"]")
        java.util.List<String> languages;

        @io.swagger.v3.oas.annotations.media.Schema(example = "[{\\\"title\\\":\\\"A\\\"}]")
        String bookmarkData;
    }

    @Test
    void fileFieldsKeepTheirOwnDescriptionAndEnumsComeFromImplementation() {
        ObjectNode props = (ObjectNode) gen.toSchema(DocumentedRequest.class).get("properties");

        String p12 = props.get("p12File").get("description").asText();
        assertTrue(p12.startsWith("The PKCS12 keystore (required for PKCS12)"), p12);
        assertTrue(p12.contains("stirling_upload"), p12);
        assertEquals("file-id", props.get("p12File").get("format").asText());
        assertEquals("FIRST", props.get("customMode").get("enum").get(0).asText());
        assertEquals("eng", props.get("languages").get("default").get(0).asText());
        assertEquals(
                "[{\"title\":\"A\"}]", props.get("bookmarkData").get("examples").get(0).asText());
    }

    @Test
    void passwordFormatSurvives() {
        ObjectNode props = (ObjectNode) gen.toSchema(SampleRequest.class).get("properties");

        assertEquals("password", props.get("password").get("format").asText());
        assertFalse(props.get("title").has("format"));
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

    @SuppressWarnings("unused")
    static class ParamsController {
        public void handle(
                @org.springframework.web.bind.annotation.RequestParam("fileInput")
                        org.springframework.web.multipart.MultipartFile file,
                @io.swagger.v3.oas.annotations.Parameter(description = "What to write")
                        @org.springframework.web.bind.annotation.RequestParam("prompt")
                        String prompt,
                @org.springframework.web.bind.annotation.RequestParam(
                                value = "tolerance",
                                defaultValue = "0.01")
                        java.math.BigDecimal tolerance) {}
    }

    @Test
    void requestParams_becomeASchema_withoutTheInputFile() throws Exception {
        ObjectNode schema =
                gen.forRequestParams(
                        ParamsController.class.getMethod(
                                "handle",
                                org.springframework.web.multipart.MultipartFile.class,
                                String.class,
                                java.math.BigDecimal.class));

        assertNotNull(schema);
        assertFalse(schema.path("properties").has("fileInput"));
        assertEquals("What to write", schema.at("/properties/prompt/description").asText());
        assertEquals("number", schema.at("/properties/tolerance/type").asText());
        assertEquals(0.01, schema.at("/properties/tolerance/default").asDouble());
        assertEquals("prompt", schema.at("/required/0").asText());
        assertEquals(1, schema.path("required").size());
    }

    @SuppressWarnings("unused")
    static class FormController {
        public void fill(
                @org.springframework.web.bind.annotation.RequestParam("file")
                        org.springframework.web.multipart.MultipartFile file,
                @io.swagger.v3.oas.annotations.Parameter(
                                description = "JSON object of field-value pairs to apply",
                                example = "{\"field\":\"value\"}")
                        @org.springframework.web.bind.annotation.RequestPart(
                                value = "data",
                                required = false)
                        byte[] values,
                @org.springframework.web.bind.annotation.RequestParam(
                                value = "flatten",
                                defaultValue = "false")
                        boolean flatten) {}
    }

    @Test
    void textRequestPartsBecomeStringParameters() throws Exception {
        ObjectNode schema =
                gen.forRequestParams(
                        FormController.class.getMethod(
                                "fill",
                                org.springframework.web.multipart.MultipartFile.class,
                                byte[].class,
                                boolean.class));
        ObjectNode props = (ObjectNode) schema.get("properties");

        assertEquals("string", props.get("data").get("type").asText());
        assertEquals(
                "JSON object of field-value pairs to apply",
                props.get("data").get("description").asText());
        assertFalse(props.get("flatten").get("default").asBoolean());
        assertFalse(props.has("file"));
    }
}
