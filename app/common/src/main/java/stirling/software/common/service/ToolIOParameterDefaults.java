package stirling.software.common.service;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.Parameter;
import java.util.Optional;

import io.swagger.v3.oas.annotations.media.Schema;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import lombok.extern.slf4j.Slf4j;

/**
 * The value a request parameter takes when the caller omits it, read from the request model so a
 * {@code @ToolIOCase} can be resolved even for a step that never sends the parameter it branches
 * on. The default is read from the field so it cannot drift.
 */
@Slf4j
public final class ToolIOParameterDefaults {

    // Swagger's sentinel for an unset @Schema string member; not a real default value.
    private static final String SCHEMA_UNSET = "##default";

    private ToolIOParameterDefaults() {}

    /**
     * The default {@code param} resolves to when absent, or empty when the parameter is required
     * with no declared default - in which case an unset value leaves the output genuinely unknown
     * rather than defaulted, and the chain reports it as uncertain.
     *
     * <p>Precedence: an explicit {@code @Schema(defaultValue)}, then the field's own value (a
     * primitive's language default, or an initializer), then the empty string for an optional field
     * left null, and finally empty for a required field with none of the above.
     */
    public static Optional<String> resolve(Method handler, String param) {
        for (Parameter parameter : handler.getParameters()) {
            Field field = findField(parameter.getType(), param);
            if (field != null) {
                return fromField(parameter.getType(), field);
            }
        }
        return Optional.empty();
    }

    private static Optional<String> fromField(Class<?> owner, Field field) {
        Schema schema = field.getAnnotation(Schema.class);
        if (schema != null
                && !schema.defaultValue().isEmpty()
                && !SCHEMA_UNSET.equals(schema.defaultValue())) {
            return Optional.of(schema.defaultValue());
        }
        Object value = readField(owner, field);
        if (value != null) {
            return Optional.of(String.valueOf(value));
        }
        return isRequired(field, schema) ? Optional.empty() : Optional.of("");
    }

    private static Object readField(Class<?> owner, Field field) {
        try {
            Object instance = owner.getDeclaredConstructor().newInstance();
            field.setAccessible(true);
            return field.get(instance);
        } catch (ReflectiveOperationException | RuntimeException e) {
            // A request model we cannot instantiate leaves the default unknown, which the check
            // treats conservatively as uncertain. Never break startup over it.
            log.warn("Could not read default of {}.{}", owner.getSimpleName(), field.getName(), e);
            return null;
        }
    }

    private static boolean isRequired(Field field, Schema schema) {
        if (schema != null && schema.requiredMode() == Schema.RequiredMode.REQUIRED) {
            return true;
        }
        return field.isAnnotationPresent(NotNull.class)
                || field.isAnnotationPresent(NotBlank.class);
    }

    private static Field findField(Class<?> type, String name) {
        for (Class<?> c = type; c != null && c != Object.class; c = c.getSuperclass()) {
            try {
                return c.getDeclaredField(name);
            } catch (NoSuchFieldException ignored) {
                // Try the superclass; request models extend a shared file-input base.
            }
        }
        return null;
    }
}
