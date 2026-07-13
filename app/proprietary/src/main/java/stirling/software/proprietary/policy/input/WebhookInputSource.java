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

import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
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

/**
 * A push source: documents arrive by signed HTTP POST to {@code /api/v1/webhooks/{webhookId}} and
 * are staged for the referencing policies. Where they are staged depends on the source's config
 * (see {@link WebhookConfig}):
 *
 * <ul>
 *   <li>no {@code connectionId}: a node-local {@link WebhookSpool} directory, read exactly as
 *       {@link FolderInputSource} reads a watched directory (self-hosted);
 *   <li>a {@code connectionId}: the referenced S3 {@code IntegrationConfig} connection, under a
 *       reserved per-webhook prefix - read, claimed, and consumed by delegating to {@link
 *       S3InputSource}, so the durable, multi-node model hosted deployments need is reused, not
 *       reinvented.
 * </ul>
 *
 * <p>Either way the {@link ResolveContext} ledger does the claiming, "mode" is "consume" (default:
 * a staged document is removed once every policy that claimed it has settled successfully) or
 * "snapshot" (stateless), and "webhookId"/"signingSecret" are minted server-side on create. Empty
 * staging reads as "verifiably no files".
 */
@Slf4j
@Service
@RequiredArgsConstructor
@ConditionalOnBooleanProperty(name = "policies.enabled")
public class WebhookInputSource implements InputSource {

    static final String TYPE = "webhook";

    private final WebhookSpool spool;
    private final FileReadinessChecker readinessChecker;
    // Deliveries staged to an S3 connection are read/claimed/consumed exactly like an S3 source, so
    // that whole path is reused rather than reimplemented; a connection-less webhook uses the
    // spool.
    private final S3InputSource s3InputSource;

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
        WebhookConfig config = WebhookConfig.from(spec.options());
        if (config.usesConnection()) {
            // Resolves the connection with the caller present, so save fails if their team can't
            // use it (the ownership check the delivery path then trusts).
            s3InputSource.validate(stagingSpec(config));
        }
    }

    /**
     * The S3 view of a webhook's durable staging: its connection plus the reserved per-webhook
     * prefix, as an {@code s3} input spec {@link S3InputSource} can resolve directly.
     */
    private static InputSpec stagingSpec(WebhookConfig config) {
        return new InputSpec(
                "s3",
                Map.of(
                        WebhookConfig.CONNECTION_ID_OPTION,
                        config.connectionId(),
                        "prefix",
                        config.stagingPrefix(),
                        "mode",
                        config.mode()));
    }

    /**
     * Mint the routing id and signing secret on create, so the delivery URL and its HMAC key are
     * always server-generated. An edit (or any options that already carry a webhookId) is left
     * untouched, so the URL a sender is already configured against never changes underneath them.
     */
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
        if (!hasId) {
            prepared.put(WebhookConfig.WEBHOOK_ID_OPTION, WebhookIds.newWebhookId());
        }
        Object secret = prepared.get(WebhookConfig.SIGNING_SECRET_OPTION);
        if (secret == null || secret.toString().isBlank()) {
            prepared.put(WebhookConfig.SIGNING_SECRET_OPTION, WebhookIds.newSigningSecret());
        }
        return prepared;
    }

    @Override
    public List<ResolvedInput> resolve(InputSpec spec, ResolveContext ctx) throws IOException {
        WebhookConfig config = WebhookConfig.from(spec.options());
        if (config.usesConnection()) {
            // Durable staging: the delivery objects live in the connection's bucket and are read,
            // claimed, and consumed by the S3 source (no principal here - the save-time check the
            // resolver trusts already ran).
            return s3InputSource.resolve(stagingSpec(config), ctx);
        }
        Path dir = spool.dirFor(config.webhookId());
        if (!Files.isDirectory(dir)) {
            // No deliveries yet (or none since the last consume): a verifiably empty source, so the
            // sweep may prune ledger rows for files that are gone. Unlike the folder source a
            // missing directory is normal here, not an unmounted-drive error.
            ctx.reportPresent(List.of());
            return List.of();
        }
        Path canonicalDir = FolderIdentities.canonicalDir(dir);
        List<Path> present = listFiles(dir);

        if (config.snapshot()) {
            List<ResolvedInput> work = new ArrayList<>();
            for (Path file : present) {
                if (readinessChecker.isReady(file)) {
                    work.add(ResolvedInput.of(PolicyInputs.of(List.of(fileResource(file)))));
                }
            }
            return work;
        }

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
                continue; // vanished or unreadable mid-sweep; the next sweep sees the truth
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

    /**
     * Settle at the claimed version, then remove the spooled file only when it is still that
     * version and every policy that claimed it has settled DONE - the same consensus delete the
     * folder and S3 sources use, so a shared webhook feeding several policies keeps a delivery
     * until all are done and one failure parks it for everyone. A failed run settles ERROR and
     * never deletes.
     */
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
            // Removed by the user or a co-watching policy's own consensus delete: nothing to do.
        } catch (IOException e) {
            log.warn("Could not remove consumed webhook delivery {}: {}", file, e.getMessage());
        }
    }

    /** Every non-hidden regular file currently spooled for the webhook. */
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
