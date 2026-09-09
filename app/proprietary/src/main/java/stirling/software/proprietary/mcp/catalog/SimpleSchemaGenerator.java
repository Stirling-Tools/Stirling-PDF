package stirling.software.proprietary.mcp.catalog;

import java.lang.reflect.Field;
import java.lang.reflect.ParameterizedType;
import java.lang.reflect.Type;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.springframework.web.multipart.MultipartFile;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * Reflection-based JSON Schema generator for controller request-body classes. {@link MultipartFile}
 * fields are emitted as {@code "type":"string"} with a {@code "format":"file-id"} hint.
 */
public final class SimpleSchemaGenerator {

    private final ObjectMapper mapper;

    public SimpleSchemaGenerator(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    public ObjectNode toSchema(Class<?> type) {
        return toSchema(type, new HashSet<>());
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
            if (field.isAnnotationPresent(JsonIgnore.class)) {
                continue;
            }
            String name = jsonPropertyName(field);
            if (!seen.add(name)) {
                continue;
            }
            properties.set(name, typeSchema(field.getGenericType(), visited));
            if (isRequired(field)) {
                required.add(name);
            }
        }

        if (!required.isEmpty()) {
            schema.set("required", required);
        }
        return schema;
    }

    private List<Field> collectFields(Class<?> type) {
        List<Field> all = new ArrayList<>();
        for (Class<?> c = type; c != null && c != Object.class; c = c.getSuperclass()) {
            for (Field f : c.getDeclaredFields()) {
                all.add(f);
            }
        }
        return all;
    }

    private static String jsonPropertyName(Field field) {
        JsonProperty ann = field.getAnnotation(JsonProperty.class);
        if (ann != null && !ann.value().isEmpty()) {
            return ann.value();
        }
        return field.getName();
    }

    private boolean isRequired(Field field) {
        JsonProperty json = field.getAnnotation(JsonProperty.class);
        if (json != null && json.required()) {
            return true;
        }
        return field.isAnnotationPresent(jakarta.validation.constraints.NotNull.class)
                || field.isAnnotationPresent(jakarta.validation.constraints.NotBlank.class)
                || field.isAnnotationPresent(jakarta.validation.constraints.NotEmpty.class);
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
            out.put(
                    "description",
                    "Reference to a previously-uploaded file in Stirling's job store.");
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
        } else if (c == float.class || c == Float.class || c == double.class || c == Double.class) {
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
