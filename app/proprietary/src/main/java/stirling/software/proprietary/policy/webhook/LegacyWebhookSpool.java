package stirling.software.proprietary.policy.webhook;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.stream.Stream;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.configuration.InstallationPathConfig;
import stirling.software.common.util.GeneralUtils;

/**
 * The plain-file spool under the install directory that predates the storage-backed index. Nothing
 * reads it any more, so it is cleared at startup.
 */
@Slf4j
@Component
public class LegacyWebhookSpool {

    static final String SPOOL_DIR = "policy-webhook-spool";

    private final Path spoolRoot;

    public LegacyWebhookSpool() {
        this(Path.of(InstallationPathConfig.getPath(), SPOOL_DIR));
    }

    LegacyWebhookSpool(Path spoolRoot) {
        this.spoolRoot = spoolRoot.toAbsolutePath().normalize();
    }

    @EventListener(ApplicationReadyEvent.class)
    public void removeIfPresent() {
        if (!Files.isDirectory(spoolRoot)) {
            return;
        }
        long files = countFiles();
        try {
            GeneralUtils.deleteDirectory(spoolRoot);
            log.info("Removed the retired webhook spool at {} ({} file(s))", spoolRoot, files);
        } catch (IOException e) {
            log.warn(
                    "Could not remove the retired webhook spool {}: {}", spoolRoot, e.getMessage());
        }
    }

    long countFiles() {
        if (!Files.isDirectory(spoolRoot)) {
            return 0;
        }
        try (Stream<Path> entries = Files.walk(spoolRoot)) {
            return entries.filter(Files::isRegularFile).count();
        } catch (IOException e) {
            log.debug("Could not inspect legacy webhook spool {}: {}", spoolRoot, e.getMessage());
            return 0;
        }
    }
}
