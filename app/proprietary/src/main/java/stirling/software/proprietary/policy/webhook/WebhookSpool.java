package stirling.software.proprietary.policy.webhook;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.UUID;

import org.springframework.stereotype.Component;

import stirling.software.common.configuration.InstallationPathConfig;

@Component
public class WebhookSpool {

    private static final String SPOOL_DIR = "policy-webhook-spool";
    private static final String TEMP_SUFFIX = ".part";
    private static final String DEFAULT_NAME = "document.pdf";
    private static final int UNIQUE_LEN = 32;

    private final Path spoolRoot;

    public WebhookSpool() {
        this(Path.of(InstallationPathConfig.getPath(), SPOOL_DIR));
    }

    public WebhookSpool(Path spoolRoot) {
        this.spoolRoot = spoolRoot.toAbsolutePath().normalize();
    }

    public Path dirFor(String webhookId) {
        if (!WebhookIds.isValidId(webhookId)) {
            throw new IllegalArgumentException("invalid webhookId");
        }
        Path dir = spoolRoot.resolve(webhookId).normalize();
        if (!dir.getParent().equals(spoolRoot)) {
            throw new IllegalArgumentException("invalid webhookId");
        }
        return dir;
    }

    public Path store(String webhookId, String filename, byte[] content) throws IOException {
        Path dir = dirFor(webhookId);
        Files.createDirectories(dir);
        String finalName = spoolName(filename);
        Path target = dir.resolve(finalName).normalize();
        Path temp = dir.resolve("." + finalName + TEMP_SUFFIX).normalize();
        if (!target.startsWith(dir) || !temp.startsWith(dir)) {
            throw new IllegalArgumentException("invalid delivery name");
        }
        Files.write(temp, content);
        try {
            Files.move(temp, target, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException atomicUnsupported) {
            Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING);
        }
        return target;
    }

    static String spoolName(String filename) {
        return UUID.randomUUID().toString().replace("-", "") + "-" + sanitize(filename);
    }

    public static String displayName(String spoolFileName) {
        int dash = spoolFileName.indexOf('-');
        if (dash == UNIQUE_LEN && dash + 1 < spoolFileName.length()) {
            return spoolFileName.substring(dash + 1);
        }
        return spoolFileName;
    }

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
        while (base.startsWith(".")) {
            base = base.substring(1);
        }
        return base.isEmpty() ? DEFAULT_NAME : base;
    }
}
