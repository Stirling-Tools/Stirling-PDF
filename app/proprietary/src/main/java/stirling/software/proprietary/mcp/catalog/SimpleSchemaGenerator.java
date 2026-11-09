package stirling.software.proprietary.mcp.catalog;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.ParameterizedType;
import java.lang.reflect.Type;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ValueConstants;
import org.springframework.web.multipart.MultipartFile;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;

import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * Reflection-based JSON Schema generator for controller request-body classes. {@link MultipartFile}
 * fields are emitted as {@code "type":"string"} with a {@code "format":"file-id"} hint.
 */
public final class SimpleSchemaGenerator {

    // Descriptions are only sent by stirling_describe_operation, so they can carry detail.
    private static final int MAX_DESCRIPTION = 400;
    private static final String FILE_HINT =
            "fileId of a file already in Stirling PDF (an earlier result or stirling_upload).";

    private final ObjectMapper mapper;

    public SimpleSchemaGenerator(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    public ObjectNode toSchema(Class<?> type) {
        return toSchema(type, new HashSet<>());
    }

    /**
     * Schema from a handler's plain {@code @RequestParam}s and text {@code @RequestPart}s (such as
     * a JSON payload); null when it has none.
     */
    public ObjectNode forRequestParams(Method method) {
        ObjectNode schema = mapper.createObjectNode();
        schema.put("type", "object");
        schema.put("additionalProperties", false);
        ObjectNode properties = schema.putObject("properties");
        ArrayNode required = mapper.createArrayNode();
        for (java.lang.reflect.Parameter p : method.getParameters()) {
            if (textPart(p, properties, required)) {
                continue;
            }
            RequestParam param = p.getAnnotation(RequestParam.class);
            if (param == null || isFile(p.getType())) {
                continue;
            }
            String name = !param.name().isEmpty() ? param.name() : param.value();
            if (name.isEmpty()) {
                continue;
            }
            ObjectNode property = typeSchema(p.getParameterizedType(), new HashSet<>());
            Parameter doc = p.getAnnotation(Parameter.class);
            if (doc != null && !doc.description().isBlank()) {
                property.put("description", doc.description().strip());
            }
            boolean hasDefault = !ValueConstants.DEFAULT_NONE.equals(param.defaultValue());
            if (hasDefault) {
                setTyped(property, "default", param.defaultValue(), property.path("type").asText());
            } else if (param.required()) {
                required.add(name);
            }
            properties.set(name, property);
        }
        if (properties.isEmpty()) {
            return null;
        }
        if (!required.isEmpty()) {
            schema.set("required", required);
        }
        return schema;
    }

    /** A {@code @RequestPart} carried as text, e.g. form-fill's JSON field values. */
    private boolean textPart(
            java.lang.reflect.Parameter p, ObjectNode properties, ArrayNode required) {
        RequestPart part = p.getAnnotation(RequestPart.class);
        if (part == null || !(p.getType() == byte[].class || p.getType() == String.class)) {
            return part != null;
        }
        String name = !part.name().isEmpty() ? part.name() : part.value();
        if (name.isEmpty()) {
            return true;
        }
        ObjectNode property = properties.putObject(name);
        property.put("type", "string");
        Parameter doc = p.getAnnotation(Parameter.class);
        if (doc != null && !doc.description().isBlank()) {
            property.put("description", doc.description().strip());
        }
        if (doc != null && !doc.example().isBlank()) {
            property.putArray("examples").add(doc.example());
        }
        if (part.required()) {
            required.add(name);
        }
        return true;
    }

    private static boolean isFile(Class<?> type) {
        return MultipartFile.class.isAssignableFrom(type)
                || (type.isArray()
                        && MultipartFile.class.isAssignableFrom(type.getComponentType()));
    }

    private ObjectNode toSchema(Class<?> type, Set<Class<?>> visited) {
        ObjectNode schema = mapper.createObjectNode();
        schema.put("type", "object");
        schema.put("additionalProperties", false);
        ObjectNode properties = schema.putObject("properties");
        ArrayNode required = mapper.createArrayNode();
        if (!visited.add(type)) {
            // Cycle: emit a loose object and bail.
            schema.put("additionalProperties", true);
            return schema;
        }

        Set<String> seen = new HashSet<>();
        for (Field field : collectFields(type)) {
            if (java.lang.reflect.Modifier.isStatic(field.getModifiers())
                    || java.lang.reflect.Modifier.isTransient(field.getModifiers())) {
                continue;
            }
            // Skip fields Jackson won't (de)serialize.
            Schema doc = field.getAnnotation(Schema.class);
            if (field.isAnnotationPresent(JsonIgnore.class) || (doc != null && doc.hidden())) {
                continue;
            }
            String name = jsonPropertyName(field);
            if (!seen.add(name)) {
                continue;
            }
            ObjectNode property = typeSchema(field.getGenericType(), visited);
            // Kept so MCP can ask the user for secrets instead of the model.
            if (isPassword(field)) {
                property.put("format", "password");
            }
            if (doc != null) {
                applySchemaDoc(property, doc);
            }
            properties.set(name, property);
            if (isRequired(field) && !property.has("default")) {
                required.add(name);
            }
        }

        if (!required.isEmpty()) {
            schema.set("required", required);
        }
        return schema;
    }

    /**
     * Inherited fields first (so shared ones like pageNumbers aren't pushed past the listing cap),
     * each name taken from its most derived declaration so a subclass can redocument it.
     */
    private List<Field> collectFields(Class<?> type) {
        List<Class<?>> chain = new ArrayList<>();
        for (Class<?> c = type; c != null && c != Object.class; c = c.getSuperclass()) {
            chain.add(c);
        }
        Map<String, Field> mostDerived = new HashMap<>();
        for (Class<?> c : chain) {
            for (Field f : c.getDeclaredFields()) {
                mostDerived.putIfAbsent(jsonPropertyName(f), f);
            }
        }
        List<Field> ordered = new ArrayList<>();
        for (int i = chain.size() - 1; i >= 0; i--) {
            for (Field f : chain.get(i).getDeclaredFields()) {
                Field chosen = mostDerived.remove(jsonPropertyName(f));
                if (chosen != null) {
                    ordered.add(chosen);
                }
            }
        }
        return ordered;
    }

    private static String jsonPropertyName(Field field) {
        JsonProperty ann = field.getAnnotation(JsonProperty.class);
        if (ann != null && !ann.value().isEmpty()) {
            return ann.value();
        }
        return field.getName();
    }

    private static boolean isPassword(Field field) {
        Schema schema = field.getAnnotation(Schema.class);
        return schema != null && "password".equals(schema.format());
    }

    private boolean isRequired(Field field) {
        JsonProperty json = field.getAnnotation(JsonProperty.class);
        if (json != null && json.required()) {
            return true;
        }
        Schema doc = field.getAnnotation(Schema.class);
        if (doc != null && doc.requiredMode() == Schema.RequiredMode.REQUIRED) {
            return true;
        }
        return field.isAnnotationPresent(jakarta.validation.constraints.NotNull.class)
                || field.isAnnotationPresent(jakarta.validation.constraints.NotBlank.class)
                || field.isAnnotationPresent(jakarta.validation.constraints.NotEmpty.class);
    }

    /** What the API docs already say: description, default, allowed values and bounds. */
    private void applySchemaDoc(ObjectNode property, Schema doc) {
        String description = doc.description().strip();
        boolean file =
                "file-id".equals(property.path("format").asText())
                        || "file-id".equals(property.path("items").path("format").asText());
        if (!description.isEmpty() && (file || !property.has("description"))) {
            // A file field says what it is for, then how to pass it.
            String text = file ? description + " Pass a " + FILE_HINT : description;
            property.put(
                    "description",
                    text.length() > MAX_DESCRIPTION
                            ? text.substring(0, MAX_DESCRIPTION - 3) + "..."
                            : text);
        }
        String type = property.path("type").asText();
        ObjectNode target =
                "array".equals(type) && property.get("items") instanceof ObjectNode items
                        ? items
                        : property;
        if (doc.allowableValues().length > 0 && !target.has("enum")) {
            ArrayNode values = target.putArray("enum");
            String valueType = target.path("type").asText();
            for (String value : doc.allowableValues()) {
                addTyped(values, value, valueType);
            }
        } else if (doc.implementation().isEnum()
                && "string".equals(target.path("type").asText())
                && !target.has("enum")) {
            // A String field documented by an enum, e.g. rearrange-pages' customMode.
            ArrayNode values = target.putArray("enum");
            for (Object constant : doc.implementation().getEnumConstants()) {
                values.add(((Enum<?>) constant).name());
            }
        }
        String defaultValue = doc.defaultValue();
        if (!defaultValue.isEmpty() && !"array".equals(type)) {
            setTyped(property, "default", defaultValue, type);
        } else if (!defaultValue.isEmpty() && target != property) {
            ArrayNode defaults = arrayDefault(defaultValue, target.path("type").asText());
            if (defaults != null) {
                property.set("default", defaults);
            }
        }
        String example = doc.example().strip();
        if (!example.isEmpty() && !file && !property.has("examples")) {
            property.putArray("examples").add(example.replace("\\\"", "\""));
        }
        if (!doc.minimum().isEmpty()) {
            setTyped(property, "minimum", doc.minimum(), "number");
        }
        if (!doc.maximum().isEmpty()) {
            setTyped(property, "maximum", doc.maximum(), "number");
        }
    }

    /** A list default such as {@code ["eng"]} or a bare {@code eng}; null when unreadable. */
    private ArrayNode arrayDefault(String value, String itemType) {
        String text = value.strip();
        ArrayNode out = mapper.createArrayNode();
        if (text.startsWith("[")) {
            try {
                mapper.readTree(text).forEach(out::add);
                return out;
            } catch (RuntimeException e) {
                return null;
            }
        }
        ObjectNode holder = mapper.createObjectNode();
        setTyped(holder, "v", text, itemType);
        return holder.has("v") ? out.add(holder.get("v")) : null;
    }

    // Integer fields list allowableValues as strings; strict validators reject 1 against ["1"].
    private static void addTyped(ArrayNode values, String value, String type) {
        try {
            switch (type) {
                case "integer" -> values.add(Long.parseLong(value.trim()));
                case "number" -> values.add(Double.parseDouble(value.trim()));
                case "boolean" -> values.add(Boolean.parseBoolean(value.trim()));
                default -> values.add(value);
            }
        } catch (NumberFormatException e) {
            values.add(value);
        }
    }

    private static void setTyped(ObjectNode node, String key, String value, String type) {
        try {
            switch (type) {
                case "integer" -> node.put(key, Long.parseLong(value.trim()));
                case "number" -> node.put(key, Double.parseDouble(value.trim()));
                case "boolean" -> node.put(key, Boolean.parseBoolean(value.trim()));
                default -> node.put(key, value);
            }
        } catch (NumberFormatException e) {
            // A default the type can't hold says nothing reliable, so leave it out.
        }
    }

    private ObjectNode typeSchema(Type t, Set<Class<?>> visited) {
        ObjectNode out = mapper.createObjectNode();
        if (t instanceof Class<?> c) {
            populatePrimitive(out, c, visited);
        } else if (t instanceof ParameterizedType pt) {
            Type raw = pt.getRawType();
            if (raw instanceof Class<?> rawClass) {
                if (java.util.Collection.class.isAssignableFrom(rawClass)) {
                    out.put("type", "array");
                    Type[] args = pt.getActualTypeArguments();
                    if (args.length == 1) {
                        out.set("items", typeSchema(args[0], visited));
                    }
                } else if (java.util.Map.class.isAssignableFrom(rawClass)) {
                    out.put("type", "object");
                    out.put("additionalProperties", true);
                } else {
                    populatePrimitive(out, rawClass, visited);
                }
            } else {
                out.put("type", "object");
            }
        } else {
            out.put("type", "object");
        }
        return out;
    }

    private void populatePrimitive(ObjectNode out, Class<?> c, Set<Class<?>> visited) {
        if (MultipartFile.class.isAssignableFrom(c)) {
            out.put("type", "string");
            out.put("format", "file-id");
            out.put("description", FILE_HINT);
            return;
        }
        if (c.isArray()) {
            out.put("type", "array");
            out.set("items", typeSchema(c.getComponentType(), visited));
            return;
        }
        if (c == String.class) {
            out.put("type", "string");
        } else if (c == boolean.class || c == Boolean.class) {
            out.put("type", "boolean");
        } else if (c == int.class
                || c == Integer.class
                || c == long.class
                || c == Long.class
                || c == short.class
                || c == Short.class
                || c == byte.class
                || c == Byte.class) {
            out.put("type", "integer");
        } else if (c == float.class
                || c == Float.class
                || c == double.class
                || c == Double.class
                || c == java.math.BigDecimal.class) {
            out.put("type", "number");
        } else if (c.isEnum()) {
            out.put("type", "string");
            ArrayNode values = out.putArray("enum");
            for (Object constant : c.getEnumConstants()) {
                values.add(constant.toString());
            }
        } else if (c == java.util.UUID.class) {
            out.put("type", "string");
            out.put("format", "uuid");
        } else if (java.time.temporal.Temporal.class.isAssignableFrom(c)
                || c == java.util.Date.class) {
            out.put("type", "string");
            out.put("format", "date-time");
        } else {
            // Complex bean: recurse with the shared visited set.
            ObjectNode nested = toSchema(c, visited);
            out.setAll(nested);
        }
    }
}
