package stirling.software.proprietary.policy.webhook;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.UUID;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.stereotype.Component;

import stirling.software.common.configuration.InstallationPathConfig;

/** Server-owned per-webhook staging directory under the install path. */
@Component
@ConditionalOnBooleanProperty(name = "policies.enabled")
public class WebhookSpool {

    private static final String SPOOL_DIR = "policy-webhook-spool";
    private static final String TEMP_SUFFIX = ".part";
    private static final String DEFAULT_NAME = "document.pdf";
    private static final int UNIQUE_LEN = 32; // UUID hex without dashes

    private final Path spoolRoot;

    public WebhookSpool() {
        this(Path.of(InstallationPathConfig.getPath(), SPOOL_DIR));
    }

    // Lets a caller (and tests) root the spool at a chosen directory; Spring uses the no-arg one.
    public WebhookSpool(Path spoolRoot) {
        this.spoolRoot = spoolRoot.toAbsolutePath().normalize();
    }

    /** The staging directory for one webhook. Never escapes the spool root; may not yet exist. */
    public Path dirFor(String webhookId) {
        if (!WebhookIds.isValidId(webhookId)) {
            throw new IllegalArgumentException("invalid webhookId");
        }
        Path dir = spoolRoot.resolve(webhookId).normalize();
        if (!dir.getParent().equals(spoolRoot)) {
            // A validated id is a single safe segment; this only trips on a bug, never user input.
            throw new IllegalArgumentException("invalid webhookId");
        }
        return dir;
    }

    /** Write a delivery into the spool atomically (staged .part, then moved into place). */
    public Path store(String webhookId, String filename, byte[] content) throws IOException {
        Path dir = dirFor(webhookId);
        Files.createDirectories(dir);
        String finalName = spoolName(filename);
        Path target = dir.resolve(finalName);
        Path temp = dir.resolve("." + finalName + TEMP_SUFFIX);
        Files.write(temp, content);
        try {
            Files.move(temp, target, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException atomicUnsupported) {
            Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING);
        }
        return target;
    }

    /** The spool file name for a delivery: a unique prefix plus the sanitised original name. */
    static String spoolName(String filename) {
        return UUID.randomUUID().toString().replace("-", "") + "-" + sanitize(filename);
    }

    /** The original name recovered from a spool file name, for the resolved input's filename. */
    public static String displayName(String spoolFileName) {
        int dash = spoolFileName.indexOf('-');
        // The unique prefix is fixed-length hex with no dashes, so the first dash is the separator.
        if (dash == UNIQUE_LEN && dash + 1 < spoolFileName.length()) {
            return spoolFileName.substring(dash + 1);
        }
        return spoolFileName;
    }

    /** S3 object-key suffix {@code <unique>/<name>}; the subfolder keeps the basename clean. */
    public static String objectKeySuffix(String filename) {
        return UUID.randomUUID().toString().replace("-", "") + "/" + sanitize(filename);
    }

    /** The staged delivery's display name (basename of {@link #objectKeySuffix}). */
    public static String objectDisplayName(String filename) {
        return sanitize(filename);
    }

    /** Reduce a client-supplied filename to a safe bare basename; fall back to a default. */
    private static String sanitize(String filename) {
        if (filename == null) {
            return DEFAULT_NAME;
        }
        String base = filename.replace('\\', '/');
        int slash = base.lastIndexOf('/');
        if (slash >= 0) {
            base = base.substring(slash + 1);
        }
        base = base.replaceAll("[^A-Za-z0-9._-]", "_").trim();
        // Strip leading dots so the result is never hidden (which resolve would skip) or empty.
        while (base.startsWith(".")) {
            base = base.substring(1);
        }
        return base.isEmpty() ? DEFAULT_NAME : base;
    }
}
