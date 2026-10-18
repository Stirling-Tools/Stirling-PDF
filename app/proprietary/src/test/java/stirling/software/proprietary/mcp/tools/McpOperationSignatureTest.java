package stirling.software.proprietary.mcp.tools;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.ObjectMapper;

class McpOperationSignatureTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void listsParametersWithOptionalMarksAndSkipsMainInput() {
        String schema =
                """
                {"type":"object","required":["angle"],"properties":{
                  "fileInput":{"type":"string","format":"file-id"},
                  "fileId":{"type":"string"},
                  "angle":{"type":"integer"},
                  "pages":{"type":"array","items":{"type":"integer"}},
                  "mode":{"type":"string","enum":["a","b","c","d","e"]}}}
                """;

        assertEquals(
                "(angle:integer, pages?:integer[], mode?:a|b|c|d|e)",
                McpOperationSignature.of(mapper.readTree(schema)));
    }

    @Test
    void showsEveryAllowedValueSoNoneHide() {
        // cert-sign's SERVER used to sit behind "..." as the fifth value.
        String schema =
                """
                {"required":["certType"],"properties":{"certType":{"type":"string",
                  "enum":["PEM","PKCS12","PFX","JKS","SERVER"]}}}
                """;

        assertEquals(
                "(certType:PEM|PKCS12|PFX|JKS|SERVER)",
                McpOperationSignature.of(mapper.readTree(schema)));
    }

    @Test
    void cutsOnlyVeryLongValueListsAndShowsRuns() {
        StringBuilder values = new StringBuilder();
        for (int i = 0; i < 30; i++) {
            values.append(i == 0 ? "" : ",").append("\"value").append(i).append('"');
        }
        String longList =
                McpOperationSignature.of(
                        mapper.readTree(
                                "{\"properties\":{\"v\":{\"type\":\"string\",\"enum\":["
                                        + values
                                        + "]}}}"));
        String levels =
                McpOperationSignature.of(
                        mapper.readTree(
                                "{\"properties\":{\"level\":{\"type\":\"integer\",\"enum\":"
                                        + "[\"1\",\"2\",\"3\",\"4\",\"5\",\"6\",\"7\",\"8\",\"9\"]}}}"));

        assertEquals(true, longList.endsWith("|...)"));
        assertEquals("(level?:1-9)", levels);
    }

    @Test
    void showsFileInputsAsFileIds() {
        String schema =
                """
                {"required":["certType"],"properties":{
                  "certType":{"type":"string"},
                  "p12File":{"type":"string","format":"file-id"},
                  "overlayFiles":{"type":"array","items":{"type":"string","format":"file-id"}}}}
                """;

        assertEquals(
                "(certType:string, p12File?:fileId, overlayFiles?:fileId[])",
                McpOperationSignature.of(mapper.readTree(schema)));
    }

    @Test
    void namesTheParametersPastTheCap() {
        StringBuilder props = new StringBuilder();
        for (int i = 0; i < 11; i++) {
            props.append(i == 0 ? "" : ",")
                    .append("\"p")
                    .append(i)
                    .append("\":{\"type\":\"boolean\"}");
        }
        String signature =
                McpOperationSignature.of(mapper.readTree("{\"properties\":{" + props + "}}"));

        assertEquals(true, signature.endsWith(", +3 more: p8, p9, p10)"));
    }

    @Test
    void showsShortListDefaults() {
        String schema =
                """
                {"properties":{"languages":{"type":"array","items":{"type":"string"},
                  "default":["eng"]}}}
                """;

        assertEquals(
                "(languages?:string[]=eng)", McpOperationSignature.of(mapper.readTree(schema)));
    }

    @Test
    void emptyWhenNoParameters() {
        assertEquals("", McpOperationSignature.of(mapper.readTree("{\"type\":\"object\"}")));
        assertEquals("", McpOperationSignature.of(null));
    }
}
