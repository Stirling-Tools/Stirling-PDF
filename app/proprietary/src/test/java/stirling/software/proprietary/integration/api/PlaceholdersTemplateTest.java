package stirling.software.proprietary.integration.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Base64;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * Body templating is what decides whether a vendor with a nested payload needs bespoke code, so the
 * headline case here is ConsignO Cloud's real {@code POST /workflows} shape.
 */
class PlaceholdersTemplateTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    private ObjectNode context() {
        ObjectNode root = objectMapper.createObjectNode();
        ObjectNode document = root.putObject("document");
        document.put("filename", "contract.pdf");
        document.put("base64", Base64.getEncoder().encodeToString("%PDF-1.7".getBytes()));
        document.put("pageCount", 4);
        root.putObject("run").put("policyName", "Signature run");
        root.putObject("sensitivityLabel").put("name", "Confidential");
        return root;
    }

    private JsonNode resolve(String template) {
        return Placeholders.resolveTree(objectMapper.readTree(template), context());
    }

    @Test
    void buildsConsignOsWorkflowPayload() {
        // Lifted from the ConsignO Cloud API reference: the document rides base64 in
        // documents[0].data, and `certifio` is the Notarius professional-certificate signer.
        String template =
                """
                {
                  "name": "{{document.filename}}",
                  "status": 1,
                  "documents": [
                    {"name": "{{document.filename}}", "data": "{{document.base64}}"}
                  ],
                  "actions": [
                    {
                      "mode": "remote",
                      "ref": "1",
                      "signer": {
                        "type": "certifio",
                        "email": "notary@example.test",
                        "lang": "en"
                      }
                    }
                  ]
                }
                """;

        JsonNode body = resolve(template);

        assertThat(body.at("/name").asString()).isEqualTo("contract.pdf");
        // Numbers and booleans keep their type; only strings are substituted.
        assertThat(body.at("/status").isNumber()).isTrue();
        assertThat(body.at("/status").asInt()).isEqualTo(1);
        assertThat(body.at("/documents/0/name").asString()).isEqualTo("contract.pdf");
        assertThat(new String(Base64.getDecoder().decode(body.at("/documents/0/data").asString())))
                .isEqualTo("%PDF-1.7");
        assertThat(body.at("/actions/0/signer/type").asString()).isEqualTo("certifio");
        assertThat(body.at("/actions/0/ref").asString()).isEqualTo("1");
    }

    @Test
    void resolvesInsideNestedObjectsAndArrays() {
        JsonNode body =
                resolve(
                        "{\"a\":{\"b\":[{\"c\":\"{{document.filename}}\"},"
                                + "\"{{run.policyName}}\"]}}");

        assertThat(body.at("/a/b/0/c").asString()).isEqualTo("contract.pdf");
        assertThat(body.at("/a/b/1").asString()).isEqualTo("Signature run");
    }

    @Test
    void leavesNonStringsAlone() {
        JsonNode body = resolve("{\"n\":3,\"b\":true,\"z\":null,\"arr\":[1,2]}");

        assertThat(body.at("/n").asInt()).isEqualTo(3);
        assertThat(body.at("/b").asBoolean()).isTrue();
        assertThat(body.at("/z").isNull()).isTrue();
        assertThat(body.at("/arr/1").asInt()).isEqualTo(2);
    }

    @Test
    void substitutesWithinSurroundingText() {
        JsonNode body = resolve("{\"subject\":\"{{run.policyName}}: {{document.filename}}\"}");

        assertThat(body.at("/subject").asString()).isEqualTo("Signature run: contract.pdf");
    }

    @Test
    void aTypoInATemplateIsAnErrorNotASilentlyEmptyPayload() {
        assertThatThrownBy(() -> resolve("{\"x\":\"{{document.flename}}\"}"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("unknown placeholder");
    }
}
