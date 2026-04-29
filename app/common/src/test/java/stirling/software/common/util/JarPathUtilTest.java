package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.Path;

import org.junit.jupiter.api.Test;

class JarPathUtilTest {

    @Test
    void currentJar_notRunningFromJar_returnsNull() {
        // When running tests from IDE/Gradle, we are not in a JAR
        Path result = JarPathUtil.currentJar();
        assertNull(result, "Should return null when not running from a JAR file");
    }

    @Test
    void restartHelperJar_notFound_returnsNull() {
        // Since we're not running from JAR and restart-helper.jar likely doesn't exist
        Path result = JarPathUtil.restartHelperJar();
        assertNull(result, "Should return null when restart-helper.jar is not found");
    }

    @Test
    void javaExecutable_returnsNonNullPath() {
        String result = JarPathUtil.javaExecutable();
        assertNotNull(result);
        assertTrue(result.contains("java"), "Should contain 'java' in the path");
        assertTrue(result.contains("bin"), "Should contain 'bin' in the path");
    }

    @Test
    void javaExecutable_containsJavaHome() {
        String javaHome = System.getProperty("java.home");
        String result = JarPathUtil.javaExecutable();
        assertTrue(result.startsWith(javaHome), "Should start with java.home system property");
    }

    @Test
    void javaExecutable_windowsHasExeExtension() {
        String result = JarPathUtil.javaExecutable();
        if (System.getProperty("os.name").toLowerCase().contains("win")) {
            assertTrue(result.endsWith(".exe"), "On Windows, should end with .exe");
        } else {
            assertFalse(result.endsWith(".exe"), "On non-Windows, should not end with .exe");
        }
    }
}
