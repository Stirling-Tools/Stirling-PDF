package stirling.software.common.configuration;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.core.Ordered;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;

import lombok.extern.slf4j.Slf4j;

/**
 * Supports the docker-secrets {@code _FILE} convention: for every environment variable ending in
 * {@code _FILE}, reads the file it points to and registers its content as the value of the
 * corresponding property (without the suffix), in both upper-case and relaxed (dotted) form.
 *
 * <p>Example: {@code SECURITY_INITIALLOGIN_PASSWORD_FILE=/run/secrets/login_password} makes
 * {@code security.initiallogin.password} resolve to the content of that file. A single trailing
 * newline written by editors is stripped so the secret value is not polluted.
 */
@Slf4j
public class SecretFileEnvironmentPostProcessor implements EnvironmentPostProcessor, Ordered {

    public static final String PROPERTY_SOURCE_NAME = "stirlingSecretFiles";
    static final String FILE_SUFFIX = "_FILE";

    @Override
    public int getOrder() {
        // Run after all other post processors so resolved values are final, then addFirst puts
        // this source at the highest precedence.
        return Ordered.LOWEST_PRECEDENCE;
    }

    @Override
    public void postProcessEnvironment(
            ConfigurableEnvironment environment, SpringApplication application) {
        if (environment.getPropertySources().contains(PROPERTY_SOURCE_NAME)) {
            return;
        }
        Map<String, String> resolved = resolve(System.getenv());
        if (!resolved.isEmpty()) {
            environment
                    .getPropertySources()
                    .addFirst(new MapPropertySource(PROPERTY_SOURCE_NAME, resolved));
        }
    }

    static Map<String, String> resolve(Map<String, String> env) {
        Map<String, String> result = new HashMap<>();
        for (Map.Entry<String, String> entry : env.entrySet()) {
            String envKey = entry.getKey();
            if (!envKey.endsWith(FILE_SUFFIX)) {
                continue;
            }
            String filePath = entry.getValue();
            if (filePath == null || filePath.isBlank()) {
                log.warn("Environment variable {} is set but empty, ignoring", envKey);
                continue;
            }
            Path path = Path.of(filePath.trim());
            if (!Files.isRegularFile(path)) {
                log.warn("{} points to '{}' which is not a readable file, ignoring", envKey, path);
                continue;
            }
            try {
                String value = stripTrailingNewline(Files.readString(path));
                String baseKey = envKey.substring(0, envKey.length() - FILE_SUFFIX.length());
                result.put(baseKey, value);
                result.put(baseKey.toLowerCase().replace('_', '.'), value);
                log.info("Loaded secret from {} for environment variable {}", path, envKey);
            } catch (IOException e) {
                log.error("Failed to read file '{}' for {}: {}", path, envKey, e.getMessage());
            }
        }
        return result;
    }

    static String stripTrailingNewline(String value) {
        if (value.endsWith("\r\n")) {
            return value.substring(0, value.length() - 2);
        }
        if (value.endsWith("\n") || value.endsWith("\r")) {
            return value.substring(0, value.length() - 1);
        }
        return value;
    }
}
