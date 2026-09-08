package stirling.software.common.configuration;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.beans.BeanInfo;
import java.beans.IntrospectionException;
import java.beans.Introspector;
import java.beans.PropertyDescriptor;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.YamlHelper;

/**
 * {@link ConfigInitializer} merges the operator's settings.yml INTO settings.yml.template and
 * writes the template's tree back, so a key the template does not declare is dropped on the next
 * startup and cannot be saved by the admin UI at all. Every {@code system.*} property therefore has
 * to appear in the template.
 */
class SettingsTemplateCoverageTest {

    /**
     * Read nowhere in the codebase, so there is no behaviour for the template to expose. Remove
     * this exclusion if the field ever gains a reader.
     */
    private static final Set<String> NOT_A_SETTING =
            Set.of("system.customPaths.pipeline.webUIConfigsDir");

    private static void collectLeafPaths(Class<?> type, String prefix, Set<String> into)
            throws IntrospectionException {
        BeanInfo info = Introspector.getBeanInfo(type, Object.class);
        for (PropertyDescriptor property : info.getPropertyDescriptors()) {
            if (property.getReadMethod() == null || property.getWriteMethod() == null) {
                continue;
            }
            String path = prefix + "." + property.getName();
            Class<?> propertyType = property.getPropertyType();
            if (propertyType.getName().startsWith("stirling.") && !propertyType.isEnum()) {
                collectLeafPaths(propertyType, path, into);
            } else {
                into.add(path);
            }
        }
    }

    @Test
    void everySystemSettingIsDeclaredInTheTemplate(@TempDir Path tmp) throws Exception {
        Set<String> expected = new TreeSet<>();
        collectLeafPaths(ApplicationProperties.System.class, "system", expected);
        expected.removeAll(NOT_A_SETTING);

        Path template = tmp.resolve("settings.yml.template");
        try (InputStream in =
                getClass().getClassLoader().getResourceAsStream("settings.yml.template")) {
            Files.copy(in, template, StandardCopyOption.REPLACE_EXISTING);
        }
        Set<String> declared = new YamlHelper(template).getAllKeys();

        List<String> missing = expected.stream().filter(key -> !declared.contains(key)).toList();
        assertEquals(List.of(), missing, "system settings missing from settings.yml.template");
    }
}
