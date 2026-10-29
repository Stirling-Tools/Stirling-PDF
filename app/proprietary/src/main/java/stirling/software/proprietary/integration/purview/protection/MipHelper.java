package stirling.software.proprietary.integration.purview.protection;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Slf4j
@Component
@RequiredArgsConstructor
public class MipHelper {

    @FunctionalInterface
    public interface TokenSource {
        String token(String scope) throws IOException;
    }

    static final Duration TIMEOUT = Duration.ofMinutes(2);
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final int MAX_STDERR_CHARS = 4000;

    private final ApplicationProperties applicationProperties;

    public boolean available() {
        Path helper = helperPath();
        return helper != null && Files.isExecutable(helper);
    }

    public JsonNode run(String operation, Map<String, String> arguments, TokenSource tokens)
            throws IOException {
        if (!available()) {
            throw new RightsManagementException(
                    RightsManagementException.UNAVAILABLE,
                    "The Microsoft Information Protection helper is not installed on this server");
        }
        Path workDir = Files.createTempDirectory("stirling-mip-");
        Path stderr = workDir.resolve("stderr.log");
        Map<String, String> args = new LinkedHashMap<>(arguments);
        args.putIfAbsent("state-dir", workDir.resolve("state").toString());
        List<String> command = new ArrayList<>();
        command.add(helperPath().toString());
        command.add(operation);
        args.forEach(
                (name, value) -> {
                    command.add("--" + name);
                    command.add(value);
                });
        Process process =
                new ProcessBuilder(command)
                        .directory(workDir.toFile())
                        .redirectError(stderr.toFile())
                        .start();
        CompletableFuture<Void> watchdog =
                CompletableFuture.runAsync(
                        process::destroyForcibly,
                        CompletableFuture.delayedExecutor(
                                TIMEOUT.toMillis(), TimeUnit.MILLISECONDS));
        try (BufferedReader out =
                        new BufferedReader(
                                new InputStreamReader(
                                        process.getInputStream(), StandardCharsets.UTF_8));
                BufferedWriter in =
                        new BufferedWriter(
                                new OutputStreamWriter(
                                        process.getOutputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = out.readLine()) != null) {
                JsonNode message = parse(line);
                if (message == null) {
                    continue;
                }
                switch (text(message, "type")) {
                    case "token_request" -> answer(in, message, tokens);
                    case "result" -> {
                        return message;
                    }
                    case "error" ->
                            throw new RightsManagementException(
                                    text(message, "code"),
                                    text(message, "message"),
                                    text(message, "owner"));
                    default -> log.debug("Ignoring helper message {}", line);
                }
            }
            process.waitFor(5, TimeUnit.SECONDS);
            throw new RightsManagementException(
                    RightsManagementException.FAILED,
                    process.isAlive() || watchdog.isDone()
                            ? "The Microsoft Information Protection helper timed out"
                            : "The Microsoft Information Protection helper exited without a"
                                    + " result: "
                                    + tail(stderr));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("Interrupted waiting for the protection helper", e);
        } finally {
            watchdog.cancel(false);
            process.destroyForcibly();
            deleteRecursively(workDir);
        }
    }

    static String scopeFor(JsonNode request) {
        String resource = text(request, "resource");
        while (resource.endsWith("/")) {
            resource = resource.substring(0, resource.length() - 1);
        }
        if (!resource.isBlank()) {
            return resource + "/.default";
        }
        String scope = text(request, "scope");
        if (scope.contains("://")) {
            return scope;
        }
        throw new IllegalArgumentException("The protection SDK asked for a token with no resource");
    }

    private static void answer(BufferedWriter in, JsonNode request, TokenSource tokens)
            throws IOException {
        String reply;
        String scope = null;
        try {
            scope = scopeFor(request);
            String token = tokens.token(scope);
            reply = "OK " + token;
        } catch (IOException | RuntimeException e) {
            String reason = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
            log.warn(
                    "Token for {} (resource {}) refused: {}",
                    scope,
                    text(request, "resource"),
                    reason);
            reply = "ERR " + reason.replaceAll("[\\r\\n]+", " ");
        }
        in.write(reply);
        in.newLine();
        in.flush();
    }

    private Path helperPath() {
        String configured =
                applicationProperties
                        .getPremium()
                        .getProFeatures()
                        .getMicrosoft()
                        .getRightsManagement()
                        .getHelperPath();
        return configured == null || configured.isBlank() ? null : Path.of(configured.trim());
    }

    private static JsonNode parse(String line) {
        String trimmed = line.trim();
        if (!trimmed.startsWith("{")) {
            return null;
        }
        try {
            return JSON.readTree(trimmed);
        } catch (RuntimeException e) {
            return null;
        }
    }

    static String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value == null || value.isNull() ? "" : value.asString();
    }

    private static String tail(Path file) {
        try {
            String content = Files.readString(file, StandardCharsets.UTF_8).trim();
            return content.length() <= MAX_STDERR_CHARS
                    ? content
                    : content.substring(content.length() - MAX_STDERR_CHARS);
        } catch (IOException e) {
            return "";
        }
    }

    private static void deleteRecursively(Path root) {
        try (var paths = Files.walk(root)) {
            paths.sorted((a, b) -> b.getNameCount() - a.getNameCount())
                    .forEach(
                            path -> {
                                try {
                                    Files.deleteIfExists(path);
                                } catch (IOException e) {
                                    log.warn("Could not delete {}", path);
                                }
                            });
        } catch (IOException e) {
            log.warn("Could not clean up {}", root);
        }
    }
}
