package stirling.software.SPDF.model.api;

import static org.junit.jupiter.api.Assertions.assertTrue;

import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Pattern;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.type.filter.RegexPatternTypeFilter;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * A documented {@code @Schema} default must be what the API really uses when the field is omitted.
 * API docs, MCP schemas and the generated client models all advertise it.
 */
class SchemaDefaultsMatchModelsTest {

    private static final List<String> PACKAGES =
            List.of(
                    "stirling.software.SPDF.model",
                    "stirling.software.common.model",
                    "stirling.software.proprietary.model");

    @Test
    void everyDocumentedDefaultIsTheFieldsInitialValue() throws Exception {
        ClassPathScanningCandidateComponentProvider scanner =
                new ClassPathScanningCandidateComponentProvider(false);
        scanner.addIncludeFilter(new RegexPatternTypeFilter(Pattern.compile(".*")));
        Set<String> mismatches = new TreeSet<>();
        for (String pkg : PACKAGES) {
            for (BeanDefinition definition : scanner.findCandidateComponents(pkg)) {
                Object instance = instantiate(definition.getBeanClassName());
                if (instance != null) {
                    collect(instance, mismatches);
                }
            }
        }
        assertTrue(
                mismatches.isEmpty(),
                "Set the field to its @Schema defaultValue, or move a placeholder to 'example':\n"
                        + String.join("\n", mismatches));
    }

    private static void collect(Object instance, Set<String> mismatches) throws Exception {
        for (Class<?> c = instance.getClass();
                c != null && c != Object.class;
                c = c.getSuperclass()) {
            for (Field field : c.getDeclaredFields()) {
                Schema schema = field.getAnnotation(Schema.class);
                if (Modifier.isStatic(field.getModifiers())
                        || schema == null
                        || schema.defaultValue().isEmpty()) {
                    continue;
                }
                field.setAccessible(true);
                Object value = field.get(instance);
                if (!same(schema.defaultValue(), value)) {
                    mismatches.add(
                            c.getSimpleName()
                                    + "."
                                    + field.getName()
                                    + ": documented "
                                    + schema.defaultValue()
                                    + ", actually "
                                    + value);
                }
            }
        }
    }

    private static boolean same(String documented, Object value) {
        if (value == null) {
            return false;
        }
        String actual = normalise(String.valueOf(value));
        String expected = normalise(documented);
        if (actual.equalsIgnoreCase(expected)) {
            return true;
        }
        try {
            return Double.parseDouble(actual) == Double.parseDouble(expected);
        } catch (NumberFormatException e) {
            return false;
        }
    }

    // Lists print as [eng] but are documented as ["eng"].
    private static String normalise(String s) {
        return s.replace("\"", "").replace(" ", "");
    }

    private static Object instantiate(String className) {
        try {
            Class<?> c = Class.forName(className);
            if (c.isInterface()
                    || c.isEnum()
                    || c.isRecord()
                    || Modifier.isAbstract(c.getModifiers())) {
                return null;
            }
            Constructor<?> constructor = c.getDeclaredConstructor();
            constructor.setAccessible(true);
            return constructor.newInstance();
        } catch (ReflectiveOperationException | LinkageError | RuntimeException e) {
            return null;
        }
    }
}
