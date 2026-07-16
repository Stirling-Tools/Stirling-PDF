package stirling.software.proprietary.policy.input;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.util.FileReadinessChecker;
import stirling.software.proprietary.policy.ledger.FolderIdentities;
import stirling.software.proprietary.policy.model.InputSpec;
import stirling.software.proprietary.policy.model.PolicyInputs;
import stirling.software.proprietary.policy.webhook.WebhookConfig;
import stirling.software.proprietary.policy.webhook.WebhookIds;
import stirling.software.proprietary.policy.webhook.WebhookSpool;

@Slf4j
@Service
@RequiredArgsConstructor
public class WebhookInputSource implements InputSource {

    static final String TYPE = "webhook";

    private final WebhookSpool spool;
    private final FileReadinessChecker readinessChecker;

    @Override
    public String type() {
        return TYPE;
    }

    @Override
    public boolean supports(InputSpec spec) {
        return spec != null && TYPE.equals(spec.type());
    }

    @Override
    public void validate(InputSpec spec) {
        WebhookConfig.from(spec.options());
    }

    @Override
    public Map<String, Object> prepareOptionsForSave(
            Map<String, Object> options, boolean isCreate) {
        boolean hasId =
                options.get(WebhookConfig.WEBHOOK_ID_OPTION) != null
                        && !options.get(WebhookConfig.WEBHOOK_ID_OPTION).toString().isBlank();
        if (!isCreate && hasId) {
            return options;
        }
        Map<String, Object> prepared = new LinkedHashMap<>(options);
        prepared.put(WebhookConfig.WEBHOOK_ID_OPTION, WebhookIds.newWebhookId());
        prepared.put(WebhookConfig.SIGNING_SECRET_OPTION, WebhookIds.newSigningSecret());
        return prepared;
    }

    @Override
    public List<ResolvedInput> resolve(InputSpec spec, ResolveContext ctx) throws IOException {
        WebhookConfig config = WebhookConfig.from(spec.options());
        Path dir = spool.dirFor(config.webhookId());
        if (!Files.isDirectory(dir)) {
            ctx.reportPresent(List.of());
            return List.of();
        }
        Path canonicalDir = FolderIdentities.canonicalDir(dir);
        List<Path> present = listFiles(dir);

        ctx.reportPresent(
                present.stream()
                        .map(file -> FolderIdentities.identity(canonicalDir, dir, file))
                        .toList());

        List<ResolvedInput> work = new ArrayList<>();
        for (Path file : present) {
            if (!readinessChecker.isReady(file)) {
                continue;
            }
            String identity = FolderIdentities.identity(canonicalDir, dir, file);
            String gate;
            boolean claimed;
            try {
                gate = FolderIdentities.statGate(file);
                claimed = ctx.claim(identity, gate, null);
            } catch (IOException | UncheckedIOException e) {
                log.debug("Could not read {} for its version: {}", file, e.getMessage());
                continue;
            }
            if (!claimed) {
                continue;
            }
            work.add(
                    new ResolvedInput(
                            PolicyInputs.of(List.of(fileResource(file))),
                            success -> completeConsumed(ctx, identity, file, gate, success)));
        }
        return work;
    }

    private static void completeConsumed(
            ResolveContext ctx, String identity, Path file, String claimGate, boolean success) {
        ctx.settle(identity, claimGate, null, success);
        if (!success) {
            return;
        }
        try {
            if (FolderIdentities.statGate(file).equals(claimGate) && ctx.allSettledDone(identity)) {
                Files.deleteIfExists(file);
            }
        } catch (java.nio.file.NoSuchFileException alreadyGone) {
        } catch (IOException e) {
            log.warn("Could not remove consumed webhook delivery {}: {}", file, e.getMessage());
        }
    }

    private static List<Path> listFiles(Path dir) throws IOException {
        List<Path> files = new ArrayList<>();
        try (Stream<Path> entries = Files.list(dir)) {
            entries.filter(Files::isRegularFile)
                    .filter(file -> !file.getFileName().toString().startsWith("."))
                    .forEach(files::add);
        }
        return files;
    }

    private static Resource fileResource(Path path) {
        String name = WebhookSpool.displayName(path.getFileName().toString());
        return new FileSystemResource(path.toFile()) {
            @Override
            public String getFilename() {
                return name;
            }
        };
    }
}
