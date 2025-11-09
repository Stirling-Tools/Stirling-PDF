package stirling.software.common.configuration;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.io.File;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.file.Paths;
import java.util.HashMap;
import java.util.Map;
import java.util.Properties;

import org.junit.jupiter.api.Test;

class InstallationPathConfigTest {

    private static final String CLASS_NAME =
            "stirling.software.common.configuration.InstallationPathConfig";

    private String folder(String first, String... more) {
        return Paths.get(first, more).toString() + File.separator;
    }

    private String file(String first, String... more) {
        return Paths.get(first, more).toString();
    }

    @Test
    void desktopModeDisabledUsesWorkingDirectory() throws Exception {
        Map<String, String> overrides = new HashMap<>();
        overrides.put("STIRLING_PDF_DESKTOP_UI", "false");

        Map<String, String> paths = loadPaths(overrides);

        String base = folder(".");

        assertEquals(base, paths.get("base"));
        assertEquals(folder(base, "logs"), paths.get("log"));
        assertEquals(file(base, "configs", "settings.yml"), paths.get("settings"));
        assertEquals(folder(base, "customFiles", "signatures"), paths.get("signatures"));
    }

    @Test
    void desktopModeEnabledOnLinuxUsesUserConfigDirectory() throws Exception {
        Map<String, String> overrides = new HashMap<>();
        overrides.put("STIRLING_PDF_DESKTOP_UI", "true");
        overrides.put("os.name", "Linux");
        overrides.put("user.home", "/home/tester");

        Map<String, String> paths = loadPaths(overrides);

        String base = folder("/home/tester", ".config", "Stirling-PDF");

        assertEquals(base, paths.get("base"));
        assertEquals(folder(base, "configs", "backup", "db"), paths.get("backup"));
        assertEquals(folder(base, "configs", "backup", "keys"), paths.get("privateKey"));
        assertEquals(folder(base, "customFiles", "templates"), paths.get("templates"));
    }

    @Test
    void desktopModeEnabledOnWindowsUsesAppData() throws Exception {
        Map<String, String> overrides = new HashMap<>();
        overrides.put("STIRLING_PDF_DESKTOP_UI", "true");
        overrides.put("os.name", "Windows 10");
        // NEU: Kein setEnv() mehr! Jetzt per System-Property
        overrides.put("STIRLING_PDF_APPDATA", "C:\\Users\\tester\\AppData\\Roaming");

        Map<String, String> paths = loadPaths(overrides);

        String base = folder("C:\\Users\\tester\\AppData\\Roaming", "Stirling-PDF");

        assertEquals(base, paths.get("base"));
        assertEquals(folder(base, "configs", "backup", "db"), paths.get("backup"));
        assertEquals(folder(base, "configs", "backup", "keys"), paths.get("privateKey"));
        assertEquals(folder(base, "customFiles", "templates"), paths.get("templates"));
    }

    @Test
    void desktopModeEnabledOnMacUsesApplicationSupport() throws Exception {
        Map<String, String> overrides = new HashMap<>();
        overrides.put("STIRLING_PDF_DESKTOP_UI", "true");
        overrides.put("os.name", "Mac OS X");
        overrides.put("user.home", "/Users/tester");

        Map<String, String> paths = loadPaths(overrides);

        String base = folder("/Users/tester", "Library", "Application Support", "Stirling-PDF");

        assertEquals(base, paths.get("base"));
        assertEquals(folder(base, "configs", "backup", "db"), paths.get("backup"));
        assertEquals(folder(base, "configs", "backup", "keys"), paths.get("privateKey"));
        assertEquals(folder(base, "customFiles", "templates"), paths.get("templates"));
    }

    private Map<String, String> loadPaths(Map<String, String> propertyOverrides) throws Exception {
        Properties originalProperties = new Properties();
        originalProperties.putAll(System.getProperties());

        propertyOverrides.forEach(
                (key, value) -> {
                    if (value == null) {
                        System.clearProperty(key);
                    } else {
                        System.setProperty(key, value);
                    }
                });

        try (URLClassLoader loader = new URLClassLoader(getClassPathUrls(), null)) {
            Class<?> configClass = Class.forName(CLASS_NAME, true, loader);
            Map<String, String> results = new HashMap<>();
            results.put("base", invokePathMethod(configClass, "getPath"));
            results.put("log", invokePathMethod(configClass, "getLogPath"));
            results.put("settings", invokePathMethod(configClass, "getSettingsPath"));
            results.put("signatures", invokePathMethod(configClass, "getSignaturesPath"));
            results.put("backup", invokePathMethod(configClass, "getBackupPath"));
            results.put("privateKey", invokePathMethod(configClass, "getPrivateKeyPath"));
            results.put("templates", invokePathMethod(configClass, "getTemplatesPath"));
            return results;
        } finally {
            System.setProperties(originalProperties);
        }
    }

    private String invokePathMethod(Class<?> configClass, String methodName) throws Exception {
        return (String) configClass.getMethod(methodName).invoke(null);
    }

    private URL[] getClassPathUrls() throws Exception {
        String classPath = System.getProperty("java.class.path", "");
        String[] entries = classPath.split(File.pathSeparator);
        URL[] urls = new URL[entries.length];
        for (int i = 0; i < entries.length; i++) {
            urls[i] = Paths.get(entries[i]).toUri().toURL();
        }
        return urls;
    }
}
