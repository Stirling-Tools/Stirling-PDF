package stirling.software.SPDF.config;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.common.configuration.RuntimePathConfig;

@ExtendWith(MockitoExtension.class)
class ExternalAppDepConfigTest {

    @Mock private EndpointConfiguration endpointConfiguration;
    @Mock private RuntimePathConfig runtimePathConfig;

    private ExternalAppDepConfig config;

    @BeforeEach
    void setUp() {
        when(runtimePathConfig.getWeasyPrintPath()).thenReturn("/custom/weasyprint");
        when(runtimePathConfig.getUnoConvertPath()).thenReturn("/custom/unoconvert");
        lenient()
                .when(endpointConfiguration.getEndpointsForGroup(anyString()))
                .thenReturn(Set.of());

        config = new ExternalAppDepConfig(endpointConfiguration, runtimePathConfig);
    }

    @Test
    void commandToGroupMappingIncludesRuntimePaths() throws Exception {
        Map<String, List<String>> mapping = getCommandToGroupMapping();

        assertEquals(List.of("Weasyprint"), mapping.get("/custom/weasyprint"));
        assertEquals(List.of("Unoconvert"), mapping.get("/custom/unoconvert"));
        assertEquals(List.of("Ghostscript"), mapping.get("gs"));
    }

    @Test
    void getAffectedFeaturesFormatsEndpoints() throws Exception {
        Set<String> endpoints = new LinkedHashSet<>(List.of("pdf-to-html", "img-extract"));
        when(endpointConfiguration.getEndpointsForGroup("Ghostscript")).thenReturn(endpoints);

        @SuppressWarnings("unchecked")
        List<String> features =
                (List<String>) invokePrivateMethod(config, "getAffectedFeatures", "Ghostscript");

        assertEquals(List.of("PDF To Html", "Image Extract"), features);
    }

    @Test
    void formatEndpointAsFeatureConvertsNames() throws Exception {
        String formatted =
                (String) invokePrivateMethod(config, "formatEndpointAsFeature", "pdf-img-extract");

        assertEquals("PDF Image Extract", formatted);
    }

    @Test
    void capitalizeWordHandlesSpecialCases() throws Exception {
        String pdf = (String) invokePrivateMethod(config, "capitalizeWord", "pdf");
        String mixed = (String) invokePrivateMethod(config, "capitalizeWord", "tEsT");
        String empty = (String) invokePrivateMethod(config, "capitalizeWord", "");

        assertEquals("PDF", pdf);
        assertEquals("Test", mixed);
        assertEquals("", empty);
    }

    @Test
    void isWeasyprintMatchesConfiguredCommands() throws Exception {
        boolean directMatch =
                (boolean) invokePrivateMethod(config, "isWeasyprint", "/custom/weasyprint");
        boolean nameContains =
                (boolean) invokePrivateMethod(config, "isWeasyprint", "/usr/bin/weasyprint-cli");
        boolean differentCommand = (boolean) invokePrivateMethod(config, "isWeasyprint", "qpdf");

        assertTrue(directMatch);
        assertTrue(nameContains);
        assertFalse(differentCommand);
    }

    @Test
    void versionComparisonHandlesDifferentFormats() {
        ExternalAppDepConfig.Version required = new ExternalAppDepConfig.Version("58");
        ExternalAppDepConfig.Version installed = new ExternalAppDepConfig.Version("57.9.2");
        ExternalAppDepConfig.Version beta = new ExternalAppDepConfig.Version("58.beta");

        assertTrue(installed.compareTo(required) < 0);
        assertEquals(0, beta.compareTo(required));
        assertEquals("58.0.0", beta.toString());
    }

    @SuppressWarnings("unchecked")
    private Map<String, List<String>> getCommandToGroupMapping() throws Exception {
        Field field = ExternalAppDepConfig.class.getDeclaredField("commandToGroupMapping");
        field.setAccessible(true);
        return (Map<String, List<String>>) field.get(config);
    }

    private Object invokePrivateMethod(Object target, String methodName, Object... args)
            throws Exception {
        Method method = findMatchingMethod(methodName, args);
        method.setAccessible(true);
        return method.invoke(target, args);
    }

    private Method findMatchingMethod(String methodName, Object[] args)
            throws NoSuchMethodException {
        Method[] methods = ExternalAppDepConfig.class.getDeclaredMethods();
        for (Method candidate : methods) {
            if (!candidate.getName().equals(methodName)
                    || candidate.getParameterCount() != args.length) {
                continue;
            }

            Class<?>[] parameterTypes = candidate.getParameterTypes();
            boolean matches = true;
            for (int i = 0; i < parameterTypes.length; i++) {
                if (!isParameterCompatible(parameterTypes[i], args[i])) {
                    matches = false;
                    break;
                }
            }

            if (matches) {
                return candidate;
            }
        }

        throw new NoSuchMethodException(
                "No matching method found for " + methodName + " with provided arguments");
    }

    private boolean isParameterCompatible(Class<?> parameterType, Object arg) {
        if (arg == null) {
            return !parameterType.isPrimitive();
        }

        Class<?> argumentClass = arg.getClass();
        if (parameterType.isPrimitive()) {
            return getWrapperType(parameterType).isAssignableFrom(argumentClass);
        }

        return parameterType.isAssignableFrom(argumentClass);
    }

    private Class<?> getWrapperType(Class<?> primitiveType) {
        if (primitiveType == boolean.class) {
            return Boolean.class;
        } else if (primitiveType == byte.class) {
            return Byte.class;
        } else if (primitiveType == short.class) {
            return Short.class;
        } else if (primitiveType == int.class) {
            return Integer.class;
        } else if (primitiveType == long.class) {
            return Long.class;
        } else if (primitiveType == float.class) {
            return Float.class;
        } else if (primitiveType == double.class) {
            return Double.class;
        } else if (primitiveType == char.class) {
            return Character.class;
        }

        throw new IllegalArgumentException("Type is not primitive: " + primitiveType);
    }
}
