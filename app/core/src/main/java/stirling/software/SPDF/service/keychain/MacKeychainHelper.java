package stirling.software.SPDF.service.keychain;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.cert.Certificate;
import java.security.cert.CertificateFactory;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Locale;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.util.ExceptionUtils;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** Invokes the bundled macOS keychain helper shipped with the Tauri desktop app. */
@Slf4j
public final class MacKeychainHelper {

    private static final String HELPER_PATH_PROP = "stirling.keychain.helper.path";
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private MacKeychainHelper() {}

    /**
     * True when the Tauri app passed {@code -Dstirling.keychain.helper.path} to the Java sidecar.
     * Bundled OpenJDK has no Apple {@code KeychainStore} provider, so signing goes through this
     * native helper instead.
     */
    public static boolean helperConfigured() {
        String path = System.getProperty(HELPER_PATH_PROP, "").trim();
        return !path.isBlank() && Files.isExecutable(Path.of(path));
    }

    public static List<Certificate> loadCertificateChain(String identityHash) throws Exception {
        String json = runHelper("get-chain", identityHash);
        JsonNode root = MAPPER.readTree(json);
        JsonNode certs = root.get("certificatesDerBase64");
        if (certs == null || !certs.isArray() || certs.isEmpty()) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.macosKeychainCertificateNotFound",
                    "Could not load the selected keychain certificate");
        }
        CertificateFactory factory = CertificateFactory.getInstance("X.509");
        List<Certificate> chain = new ArrayList<>();
        for (JsonNode node : certs) {
            byte[] der = Base64.getDecoder().decode(node.asText());
            chain.add(factory.generateCertificate(new java.io.ByteArrayInputStream(der)));
        }
        return chain;
    }

    public static byte[] sign(String identityHash, String jcaAlgorithm, byte[] message)
            throws Exception {
        ProcessBuilder builder =
                new ProcessBuilder(helperPath(), "sign", normalizeHash(identityHash), jcaAlgorithm);
        builder.redirectErrorStream(true);
        Process process = builder.start();
        process.getOutputStream().write(message);
        process.getOutputStream().close();

        byte[] stdout = readAll(process.getInputStream());
        int exit = process.waitFor();
        if (exit != 0) {
            String error = extractError(stdout);
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.macosKeychainSignFailed", "Keychain signing failed: {0}", error);
        }
        return stdout;
    }

    private static String runHelper(String command, String identityHash) throws Exception {
        ProcessBuilder builder =
                new ProcessBuilder(helperPath(), command, normalizeHash(identityHash));
        builder.redirectErrorStream(true);
        Process process = builder.start();
        byte[] stdout = readAll(process.getInputStream());
        int exit = process.waitFor();
        if (exit != 0) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.macosKeychainHelperFailed",
                    "Keychain helper failed: {0}",
                    extractError(stdout));
        }
        return new String(stdout, StandardCharsets.UTF_8);
    }

    private static String helperPath() {
        String path = System.getProperty(HELPER_PATH_PROP, "").trim();
        if (path.isBlank() || !Files.isExecutable(Path.of(path))) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.macosKeychainUnavailable",
                    "macOS Keychain signing is only available in the Stirling PDF macOS app");
        }
        return path;
    }

    private static String normalizeHash(String value) {
        return value == null ? "" : value.replace(" ", "").toUpperCase(Locale.ROOT);
    }

    private static byte[] readAll(InputStream input) throws IOException {
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        input.transferTo(buffer);
        return buffer.toByteArray();
    }

    private static String extractError(byte[] stdout) {
        String text = new String(stdout, StandardCharsets.UTF_8).trim();
        if (text.isBlank()) {
            return "Unknown keychain helper error";
        }
        try {
            JsonNode root = MAPPER.readTree(text);
            JsonNode error = root.get("error");
            if (error != null && !error.asText().isBlank()) {
                return error.asText();
            }
        } catch (Exception ignored) {
            // Fall back to raw output below.
        }
        return text;
    }
}
