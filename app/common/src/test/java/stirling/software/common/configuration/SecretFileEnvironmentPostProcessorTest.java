package stirling.software.common.configuration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class SecretFileEnvironmentPostProcessorTest {

    @TempDir Path tempDir;

    @Test
    void loadsSecretFromFileAndMapsRelaxedKey() throws IOException {
        Path secret = tempDir.resolve("login_password");
        Files.writeString(secret, "s3cr3t");

        Map<String, String> env = Map.of("SECURITY_INITIALLOGIN_PASSWORD_FILE", secret.toString());
        Map<String, String> resolved = SecretFileEnvironmentPostProcessor.resolve(env);

        assertEquals("s3cr3t", resolved.get("SECURITY_INITIALLOGIN_PASSWORD"));
        assertEquals("s3cr3t", resolved.get("security.initiallogin.password"));
    }

    @Test
    void stripsSingleTrailingNewline() throws IOException {
        Path lf = tempDir.resolve("lf");
        Path crlf = tempDir.resolve("crlf");
        Files.writeString(lf, "value\n");
        Files.writeString(crlf, "value\r\n");

        Map<String, String> resolved =
                SecretFileEnvironmentPostProcessor.resolve(
                        Map.of(
                                "TEST_SECRET_LF_FILE", lf.toString(),
                                "TEST_SECRET_CRLF_FILE", crlf.toString()));

        assertEquals("value", resolved.get("TEST_SECRET_LF"));
        assertEquals("value", resolved.get("TEST_SECRET_CRLF"));
    }

    @Test
    void keepsInnerNewlinesAndTrailingWhitespace() throws IOException {
        Path secret = tempDir.resolve("multiline");
        Files.writeString(secret, "line1\nline2  ");

        Map<String, String> resolved =
                SecretFileEnvironmentPostProcessor.resolve(
                        Map.of("TEST_MULTILINE_FILE", secret.toString()));

        assertEquals("line1\nline2  ", resolved.get("TEST_MULTILINE"));
    }

    @Test
    void ignoresMissingFile() {
        Map<String, String> resolved =
                SecretFileEnvironmentPostProcessor.resolve(
                        Map.of("TEST_MISSING_SECRET_FILE", tempDir.resolve("nope").toString()));

        assertNull(resolved.get("TEST_MISSING_SECRET"));
        assertFalse(resolved.containsKey("test.missing.secret"));
    }

    @Test
    void ignoresBlankValueAndNonFileSuffix() {
        Map<String, String> resolved =
                SecretFileEnvironmentPostProcessor.resolve(
                        Map.of(
                                "TEST_BLANK_FILE", "   ",
                                "TEST_OTHER", "value"));

        assertTrue(resolved.isEmpty());
    }

    @Test
    void emptyEnvYieldsEmptyResult() {
        assertTrue(SecretFileEnvironmentPostProcessor.resolve(new HashMap<>()).isEmpty());
    }
}
