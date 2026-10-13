package stirling.software.proprietary.mcp.catalog;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.ObjectProvider;

import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.service.ServerCertificateServiceInterface;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

class McpSchemaAdjusterTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @SuppressWarnings("unchecked")
    private static <T> ObjectProvider<T> provider(T value) {
        ObjectProvider<T> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(value);
        return provider;
    }

    private OperationMeta op(String id, String schema) {
        return new OperationMeta(
                id,
                OperationCategory.SECURITY,
                id,
                (ObjectNode) mapper.readTree(schema),
                "mcp.tools.write",
                OperationMeta.Target.JAVA_ENDPOINT,
                "/api/v1/security/" + id,
                null);
    }

    private OperationMeta certSign() {
        return op(
                "cert-sign",
                """
                {"properties":{"certType":{"type":"string",
                  "enum":["SERVER","PEM","PKCS12","PFX","JKS","WINDOWS_STORE","PKCS11"]},
                  "pkcs11LibraryPath":{"type":"string"},"pkcs11Slot":{"type":"integer"},
                  "alias":{"type":"string"}}}
                """);
    }

    private static List<String> certTypes(OperationMeta meta) {
        List<String> types = new ArrayList<>();
        meta.paramSchema()
                .path("properties")
                .path("certType")
                .path("enum")
                .forEach(t -> types.add(t.asText()));
        return types;
    }

    @Test
    void aServerOffersItsOwnCertificateButNoDesktopTokens() {
        ServerCertificateServiceInterface server = mock(ServerCertificateServiceInterface.class);
        when(server.isEnabled()).thenReturn(true);
        McpSchemaAdjuster adjuster =
                new McpSchemaAdjuster(provider(server), "Server-jar", provider(null));
        OperationMeta original = certSign();

        OperationMeta fitted = adjuster.adjust(original);

        assertEquals(List.of("SERVER", "PEM", "PKCS12", "PFX", "JKS"), certTypes(fitted));
        JsonNode props = fitted.paramSchema().get("properties");
        assertFalse(props.has("pkcs11LibraryPath"));
        assertTrue(props.has("alias"), "alias still picks an entry in a keystore");
        assertEquals(7, certTypes(original).size(), "the cached schema is untouched");
    }

    @Test
    void noServerCertificateWhenItIsSwitchedOffAndTokensOnTheDesktop() {
        ServerCertificateServiceInterface server = mock(ServerCertificateServiceInterface.class);
        when(server.isEnabled()).thenReturn(false);
        McpSchemaAdjuster adjuster =
                new McpSchemaAdjuster(provider(server), "Client-win", provider(null));

        List<String> types = certTypes(adjuster.adjust(certSign()));

        assertFalse(types.contains("SERVER"));
        assertTrue(types.contains("PKCS11"));
    }

    @Test
    void ocrLanguagesAreTheInstalledOnes(@TempDir Path tessdata) throws Exception {
        Files.createFile(tessdata.resolve("eng.traineddata"));
        Files.createFile(tessdata.resolve("fra.traineddata"));
        Files.createFile(tessdata.resolve("osd.traineddata"));
        RuntimePathConfig paths = mock(RuntimePathConfig.class);
        when(paths.getTessDataPath()).thenReturn(tessdata.toString());
        McpSchemaAdjuster adjuster = new McpSchemaAdjuster(provider(null), null, provider(paths));
        OperationMeta ocr =
                op(
                        "ocr-pdf",
                        """
                        {"properties":{"languages":{"type":"array","items":{"type":"string"}}}}
                        """);

        JsonNode values = adjuster.adjust(ocr).paramSchema().at("/properties/languages/items/enum");

        assertEquals("[\"eng\",\"fra\"]", values.toString());
    }

    @Test
    void otherOperationsPassThroughUnchanged() {
        McpSchemaAdjuster adjuster = new McpSchemaAdjuster(provider(null), null, provider(null));
        OperationMeta compress = op("compress-pdf", "{\"properties\":{}}");

        assertSame(compress, adjuster.adjust(compress));
    }
}
