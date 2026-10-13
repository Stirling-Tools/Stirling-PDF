package stirling.software.proprietary.mcp.catalog;

import java.io.File;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.service.ServerCertificateServiceInterface;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * Fits an operation's schema to this server: options it can't honour are dropped and lists that
 * depend on what is installed are filled in, so a chat model only sees choices that work.
 */
@Component
@ConditionalOnProperty(name = "mcp.enabled", havingValue = "true")
public class McpSchemaAdjuster {

    private static final Set<String> DESKTOP_CERT_TYPES = Set.of("WINDOWS_STORE", "PKCS11");
    // Inherited or shared request fields these endpoints never read.
    private static final Map<String, String> UNUSED =
            Map.of(
                    "add-page-numbers", "pageNumbers",
                    "vector-to-pdf", "outputFormat",
                    "merge-pdfs", "clientFileIds");

    private final ObjectProvider<ServerCertificateServiceInterface> serverCertificate;
    private final String machineType;
    private final ObjectProvider<RuntimePathConfig> paths;

    public McpSchemaAdjuster(
            ObjectProvider<ServerCertificateServiceInterface> serverCertificate,
            @Autowired(required = false) @Qualifier("machineType") String machineType,
            ObjectProvider<RuntimePathConfig> paths) {
        this.serverCertificate = serverCertificate;
        this.machineType = machineType;
        this.paths = paths;
    }

    // Over MCP, update-metadata keeps the fields a call leaves out (McpMetadataKeep).
    private static final String METADATA_SUMMARY =
            "Change a PDF's metadata: send only the fields to change and the rest are kept; \"\""
                    + " removes a field, deleteAll clears everything";
    private static final String METADATA_DETAILS =
            "Send only the standard fields to change (title, author, subject, keywords, creator,"
                    + " producer, creationDate, modificationDate, trapped); the others keep their"
                    + " current values. Send an empty string to remove a field. Dates use"
                    + " yyyy/MM/dd HH:mm:ss. Custom keys go in allRequestParams as a JSON object."
                    + " deleteAll=true removes all metadata, including XMP.";

    /** Usage notes for describe that replace the endpoint's own, where MCP behaves differently. */
    public static String details(String operation) {
        return "update-metadata".equals(operation) ? METADATA_DETAILS : null;
    }

    /** The operation as this server can run it; the cached original is never changed. */
    public OperationMeta adjust(OperationMeta meta) {
        ObjectNode schema =
                switch (meta.id()) {
                    case "cert-sign" -> certSign(meta.paramSchema());
                    case "ocr-pdf" -> ocr(meta.paramSchema());
                    case "update-metadata" -> metadata(meta.paramSchema());
                    default -> withoutUnused(meta.id(), meta.paramSchema());
                };
        if (schema == null) {
            return meta;
        }
        return new OperationMeta(
                meta.id(),
                meta.category(),
                "update-metadata".equals(meta.id()) ? METADATA_SUMMARY : meta.summary(),
                schema,
                meta.requiredScope(),
                meta.target(),
                meta.endpointPath(),
                meta.handlerMethod());
    }

    private ObjectNode certSign(ObjectNode original) {
        ObjectNode schema = original.deepCopy();
        ObjectNode properties = (ObjectNode) schema.get("properties");
        if (properties == null || !(properties.path("certType").get("enum") instanceof ArrayNode)) {
            return null;
        }
        ServerCertificateServiceInterface server = serverCertificate.getIfAvailable();
        boolean serverCert = server != null && server.isEnabled();
        boolean desktop = isDesktop();
        ArrayNode kept = schema.arrayNode();
        for (JsonNode value : properties.path("certType").get("enum")) {
            String type = value.asText();
            if (("SERVER".equals(type) && !serverCert)
                    || (DESKTOP_CERT_TYPES.contains(type) && !desktop)) {
                continue;
            }
            kept.add(value);
        }
        ((ObjectNode) properties.get("certType")).set("enum", kept);
        if (!desktop) {
            properties.remove("pkcs11LibraryPath");
            properties.remove("pkcs11Slot");
        }
        return schema;
    }

    private static ObjectNode metadata(ObjectNode original) {
        ObjectNode schema = original.deepCopy();
        if (schema.get("properties") instanceof ObjectNode properties) {
            properties
                    .properties()
                    .forEach(
                            e -> {
                                if (e.getValue() instanceof ObjectNode prop
                                        && prop.path("description")
                                                .asText()
                                                .contains("Omit to remove it")) {
                                    prop.put(
                                            "description",
                                            prop.get("description")
                                                    .asText()
                                                    .replace(
                                                            "Omit to remove it",
                                                            "Omit to keep its current value; send \"\" to"
                                                                    + " remove it"));
                                }
                            });
        }
        return schema;
    }

    private static ObjectNode withoutUnused(String id, ObjectNode original) {
        String field = UNUSED.get(id);
        if (field == null || !original.path("properties").has(field)) {
            return null;
        }
        ObjectNode schema = original.deepCopy();
        ((ObjectNode) schema.get("properties")).remove(field);
        if (schema.get("required") instanceof ArrayNode required) {
            for (int i = required.size() - 1; i >= 0; i--) {
                if (field.equals(required.get(i).asText())) {
                    required.remove(i);
                }
            }
        }
        return schema;
    }

    /** Hardware tokens only work for the desktop app; same test as HardwareKeyStoreService. */
    private boolean isDesktop() {
        return Boolean.parseBoolean(System.getProperty("STIRLING_PDF_TAURI_MODE", "false"))
                || (machineType != null && machineType.startsWith("Client-"));
    }

    /** Only installed languages work; others are silently dropped by the OCR step. */
    private ObjectNode ocr(ObjectNode original) {
        List<String> installed = installedOcrLanguages();
        JsonNode items = original.path("properties").path("languages").path("items");
        if (installed.isEmpty() || !items.isObject()) {
            return null;
        }
        ObjectNode schema = original.deepCopy();
        ArrayNode values =
                ((ObjectNode) schema.path("properties").path("languages").path("items"))
                        .putArray("enum");
        installed.forEach(values::add);
        return schema;
    }

    private List<String> installedOcrLanguages() {
        RuntimePathConfig config = paths.getIfAvailable();
        File[] files =
                config == null || config.getTessDataPath() == null
                        ? null
                        : new File(config.getTessDataPath()).listFiles();
        if (files == null) {
            return List.of();
        }
        return Arrays.stream(files)
                .map(File::getName)
                .filter(name -> name.endsWith(".traineddata"))
                .map(name -> name.substring(0, name.length() - ".traineddata".length()))
                .filter(lang -> !"osd".equals(lang.toLowerCase(Locale.ROOT)))
                .sorted()
                .toList();
    }
}
