package stirling.software.common.configuration;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.io.File;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

class InstallationPathConfigTest {
    @Test
    void whenDesktopModeDisabled_pathsResolveRelativeToCurrentDirectory() throws Exception {
        Map<String, String> properties = new HashMap<>();
        properties.put("STIRLING_PDF_DESKTOP_UI", "false");
        properties.put("STIRLING_PDF_APPDATA", null);
        properties.put("os.name", "Linux");
        properties.put("user.home", "/home/tester");

        withInstallationPathConfig(
                properties,
                clazz -> {
                    String expectedBase = "." + File.separator;
                    String expectedConfig = expectedBase + "configs" + File.separator;
                    String expectedCustomFiles = expectedBase + "customFiles" + File.separator;
                    String expectedBackupRoot = expectedConfig + "backup" + File.separator;

                    assertEquals(expectedBase, invokeStringMethod(clazz, "getPath"));
                    assertEquals(
                            expectedBase + "logs" + File.separator,
                            invokeStringMethod(clazz, "getLogPath"));
                    assertEquals(expectedConfig, invokeStringMethod(clazz, "getConfigPath"));
                    assertEquals(
                            expectedCustomFiles, invokeStringMethod(clazz, "getCustomFilesPath"));
                    assertEquals(
                            expectedBase + "clientWebUI" + File.separator,
                            invokeStringMethod(clazz, "getClientWebUIPath"));
                    assertEquals(
                            expectedBase + "pipeline" + File.separator,
                            invokeStringMethod(clazz, "getPipelinePath"));
                    assertEquals(
                            expectedConfig + "scripts" + File.separator,
                            invokeStringMethod(clazz, "getScriptsPath"));
                    assertEquals(
                            expectedConfig + "settings.yml",
                            invokeStringMethod(clazz, "getSettingsPath"));
                    assertEquals(
                            expectedConfig + "custom_settings.yml",
                            invokeStringMethod(clazz, "getCustomSettingsPath"));
                    assertEquals(
                            expectedCustomFiles + "static" + File.separator,
                            invokeStringMethod(clazz, "getStaticPath"));
                    assertEquals(
                            expectedCustomFiles + "templates" + File.separator,
                            invokeStringMethod(clazz, "getTemplatesPath"));
                    assertEquals(
                            expectedCustomFiles + "signatures" + File.separator,
                            invokeStringMethod(clazz, "getSignaturesPath"));
                    assertEquals(
                            expectedBackupRoot + "keys" + File.separator,
                            invokeStringMethod(clazz, "getPrivateKeyPath"));
                    assertEquals(
                            expectedBackupRoot + "db" + File.separator,
                            invokeStringMethod(clazz, "getBackupPath"));
                    return null;
                });
    }

    @Test
    void whenDesktopWindowsUsesAppDataProperty() throws Exception {
        Map<String, String> properties = new HashMap<>();
        properties.put("STIRLING_PDF_DESKTOP_UI", "true");
        properties.put("STIRLING_PDF_APPDATA", "/data/AppData/Roaming");
        properties.put("os.name", "Windows 11");
        properties.put("user.home", "/home/tester");

        withInstallationPathConfig(
                properties,
                clazz -> {
                    String expectedBase =
                            Paths.get("/data/AppData/Roaming", "Stirling-PDF").toString()
                                    + File.separator;
                    assertEquals(expectedBase, invokeStringMethod(clazz, "getPath"));
                    return null;
                });
    }

    @Test
    void whenDesktopMacUsesLibraryApplicationSupport() throws Exception {
        Map<String, String> properties = new HashMap<>();
        properties.put("STIRLING_PDF_DESKTOP_UI", "true");
        properties.put("STIRLING_PDF_APPDATA", null);
        properties.put("os.name", "Mac OS X");
        properties.put("user.home", "/Users/tester");

        withInstallationPathConfig(
                properties,
                clazz -> {
                    String expectedBase =
                            Paths.get(
                                                    "/Users/tester",
                                                    "Library",
                                                    "Application Support",
                                                    "Stirling-PDF")
                                            .toString()
                                    + File.separator;
                    assertEquals(expectedBase, invokeStringMethod(clazz, "getPath"));
                    return null;
                });
    }

    @Test
    void whenDesktopLinuxUsesConfigDirectory() throws Exception {
        Map<String, String> properties = new HashMap<>();
        properties.put("STIRLING_PDF_DESKTOP_UI", "true");
        properties.put("STIRLING_PDF_APPDATA", null);
        properties.put("os.name", "Linux");
        properties.put("user.home", "/home/linux-user");

        withInstallationPathConfig(
                properties,
                clazz -> {
                    String expectedBase =
                            Paths.get("/home/linux-user", ".config", "Stirling-PDF").toString()
                                    + File.separator;
                    assertEquals(expectedBase, invokeStringMethod(clazz, "getPath"));
                    return null;
                });
    }

    @Test
    void whenDesktopWindowsMissingAppDataFallsBackToCurrentDirectory() throws Exception {
        Map<String, String> properties = new HashMap<>();
        properties.put("STIRLING_PDF_DESKTOP_UI", "true");
        properties.put("STIRLING_PDF_APPDATA", "");
        properties.put("os.name", "Windows 10");
        properties.put("user.home", "/home/tester");

        withInstallationPathConfig(
                properties,
                clazz -> {
                    String expectedBase = "." + File.separator;
                    assertEquals(expectedBase, invokeStringMethod(clazz, "getPath"));
                    return null;
                });
    }

    private <T> T withInstallationPathConfig(
            Map<String, String> properties, ClassCallback<T> callback) throws Exception {
        Map<String, String> originalValues = new HashMap<>();
        for (String key : properties.keySet()) {
            originalValues.put(key, System.getProperty(key));
        }
        try {
            for (Map.Entry<String, String> entry : properties.entrySet()) {
                if (entry.getValue() == null) {
                    System.clearProperty(entry.getKey());
                } else {
                    System.setProperty(entry.getKey(), entry.getValue());
                }
            }

            URL[] urls = buildClassPathUrls();
            try (URLClassLoader isolatedLoader = new URLClassLoader(urls, null)) {
                Class<?> clazz =
                        Class.forName(
                                "stirling.software.common.configuration.InstallationPathConfig",
                                true,
                                isolatedLoader);
                return callback.apply(clazz);
            }
        } finally {
            for (Map.Entry<String, String> entry : originalValues.entrySet()) {
                if (entry.getValue() == null) {
                    System.clearProperty(entry.getKey());
                } else {
                    System.setProperty(entry.getKey(), entry.getValue());
                }
            }
        }
    }

    private static URL[] buildClassPathUrls() throws Exception {
        String classPath = System.getProperty("java.class.path", "");
        String[] entries = classPath.split(File.pathSeparator);
        List<URL> urls = new ArrayList<>();
        for (String entry : entries) {
            if (entry == null || entry.isEmpty()) {
                continue;
            }
            urls.add(new File(entry).toURI().toURL());
        }
        return urls.toArray(new URL[0]);
    }

    private static String invokeStringMethod(Class<?> clazz, String methodName) throws Exception {
        return (String) clazz.getMethod(methodName).invoke(null);
    }

    @FunctionalInterface
    private interface ClassCallback<T> {
        T apply(Class<?> clazz) throws Exception;
    }
}
