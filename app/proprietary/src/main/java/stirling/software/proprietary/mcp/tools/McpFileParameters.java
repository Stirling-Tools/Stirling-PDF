package stirling.software.proprietary.mcp.tools;

import java.util.LinkedHashSet;
import java.util.Set;

import org.springframework.core.MethodParameter;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.proprietary.mcp.catalog.OperationMeta;

import tools.jackson.databind.JsonNode;

/** Where an endpoint expects its files: the main upload's part name and any extra file fields. */
final class McpFileParameters {

    static final String DEFAULT_PART = "fileInput";

    private McpFileParameters() {}

    /** The main upload's part name; most endpoints use fileInput, a few a plain @RequestParam. */
    /** False for endpoints that build a file from parameters alone, e.g. url-to-pdf. */
    static boolean takesFile(OperationMeta meta) {
        if (meta.handlerMethod() == null) {
            return true;
        }
        for (MethodParameter p : meta.handlerMethod().getMethodParameters()) {
            if (isFileType(p.getParameterType()) || hasFileField(p.getParameterType())) {
                return true;
            }
        }
        return false;
    }

    private static boolean isFileType(Class<?> type) {
        return MultipartFile.class.isAssignableFrom(type)
                || (type.isArray()
                        && MultipartFile.class.isAssignableFrom(type.getComponentType()));
    }

    private static boolean hasFileField(Class<?> type) {
        if (type.isPrimitive() || type.getName().startsWith("java.")) {
            return false;
        }
        for (Class<?> c = type; c != null && c != Object.class; c = c.getSuperclass()) {
            for (java.lang.reflect.Field field : c.getDeclaredFields()) {
                Class<?> fieldType = field.getType();
                boolean listOfFiles =
                        java.util.Collection.class.isAssignableFrom(fieldType)
                                && field.getGenericType().getTypeName().contains("MultipartFile");
                if (isFileType(fieldType) || listOfFiles) {
                    return true;
                }
            }
        }
        return false;
    }

    static String inputPart(OperationMeta meta) {
        if (meta.handlerMethod() == null) {
            return DEFAULT_PART;
        }
        for (MethodParameter p : meta.handlerMethod().getMethodParameters()) {
            Class<?> type = p.getParameterType();
            boolean file =
                    MultipartFile.class.isAssignableFrom(type)
                            || (type.isArray()
                                    && MultipartFile.class.isAssignableFrom(
                                            type.getComponentType()));
            if (!file) {
                continue;
            }
            String name = partName(p);
            if (name != null) {
                return name;
            }
        }
        return DEFAULT_PART;
    }

    private static String partName(MethodParameter p) {
        RequestParam param = p.getParameterAnnotation(RequestParam.class);
        if (param != null) {
            String name = !param.name().isEmpty() ? param.name() : param.value();
            return name.isEmpty() ? p.getParameterName() : name;
        }
        RequestPart part = p.getParameterAnnotation(RequestPart.class);
        if (part != null) {
            String name = !part.name().isEmpty() ? part.name() : part.value();
            return name.isEmpty() ? p.getParameterName() : name;
        }
        return null;
    }

    /** The list field that is the whole input when there is no fileInput, e.g. create-portfolio. */
    static String listInput(JsonNode paramSchema) {
        JsonNode properties = paramSchema == null ? null : paramSchema.get("properties");
        if (properties == null || properties.has(DEFAULT_PART)) {
            return null;
        }
        Set<String> fields = fileFields(paramSchema);
        if (fields.size() != 1) {
            return null;
        }
        String field = fields.iterator().next();
        return "array".equals(properties.path(field).path("type").asText()) ? field : null;
    }

    /** True for operations that take several documents, such as merge-pdfs. */
    static boolean acceptsManyFiles(JsonNode paramSchema) {
        JsonNode fileInput =
                paramSchema == null ? null : paramSchema.path("properties").path(DEFAULT_PART);
        return (fileInput != null && "array".equals(fileInput.path("type").asText()))
                || listInput(paramSchema) != null;
    }

    /** Parameters other than the main input that take files, e.g. overlayFiles or attachments. */
    static Set<String> fileFields(JsonNode paramSchema) {
        Set<String> fields = new LinkedHashSet<>();
        JsonNode properties = paramSchema == null ? null : paramSchema.get("properties");
        if (properties == null || !properties.isObject()) {
            return fields;
        }
        properties
                .properties()
                .forEach(
                        e -> {
                            JsonNode prop = e.getValue();
                            boolean file =
                                    "file-id".equals(prop.path("format").asText())
                                            || "file-id"
                                                    .equals(
                                                            prop.path("items")
                                                                    .path("format")
                                                                    .asText());
                            if (file && !DEFAULT_PART.equals(e.getKey())) {
                                fields.add(e.getKey());
                            }
                        });
        return fields;
    }
}
