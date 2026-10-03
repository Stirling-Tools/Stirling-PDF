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

/**
 * The plain-file spool under the install directory that predates the storage-backed index. Nothing
 * reads it any more, so a document still in it will never be processed. It is reported, not
 * touched: what to do with a document nobody processed is the operator's call.
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
    public void warnIfPresent() {
        long files = countFiles();
        if (files > 0) {
            log.warn(
                    "{} file(s) remain in the retired webhook spool at {}. They predate"
                            + " storage-backed deliveries and will not be processed; review and"
                            + " remove them.",
                    files,
                    spoolRoot);
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
