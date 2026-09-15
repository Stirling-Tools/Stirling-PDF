package stirling.software.proprietary.policy.trigger;

import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.policy.engine.PolicyRunner;
import stirling.software.proprietary.policy.engine.SweepKind;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.model.PolicyBinding;
import stirling.software.proprietary.policy.model.TriggerConfig;
import stirling.software.proprietary.policy.source.SourceStore;
import stirling.software.proprietary.policy.store.PolicyStore;

/**
 * Polls durable storage-folder bindings, so uploads and moves are discovered across restarts and
 * backend instances. The processed-file ledger arbitrates claims; each folder drains its current
 * batch before another is submitted.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class StorageFolderTrigger implements PolicyTrigger {
    private final PolicyStore policyStore;
    private final SourceStore sourceStore;
    private final PolicyRunner policyRunner;
    private final ApplicationProperties applicationProperties;
    private ScheduledExecutorService scheduler;

    @Override
    public String type() {
        return TriggerConfig.STORAGE_FOLDER_WATCH;
    }

    @Override
    public boolean requiresSource() {
        return true;
    }

    @Override
    public Set<String> supportedSourceTypes() {
        return Set.of("storage-folder");
    }

    @Override
    public synchronized void start() {
        if (scheduler != null) {
            return;
        }
        long seconds =
                Math.max(1, applicationProperties.getPolicies().getStorageFolderSweepSeconds());
        scheduler =
                Executors.newSingleThreadScheduledExecutor(
                        Thread.ofVirtual().name("storage-folder-poll-", 0).factory());
        scheduler.scheduleWithFixedDelay(this::safeSweep, 0, seconds, TimeUnit.SECONDS);
    }

    @Override
    public synchronized void stop() {
        if (scheduler != null) {
            scheduler.shutdownNow();
            scheduler = null;
        }
    }

    private void safeSweep() {
        try {
            sweep();
        } catch (RuntimeException e) {
            log.warn("Could not poll processing folders: {}", e.getMessage(), e);
        }
    }

    void sweep() {
        if (!applicationProperties.getStorage().isEnabled()
                || !applicationProperties.getSecurity().isEnableLogin()) {
            return;
        }
        for (PolicyBinding binding : policyStore.findBindingsByTriggerType(type())) {
            if (Thread.currentThread().isInterrupted()) {
                return;
            }
            try {
                // Earlier folders can take time to enumerate; honour edits and pauses made
                // meanwhile.
                Policy current = policyStore.get(binding.policy().id()).orElse(null);
                if (current == null || !current.enabled() || !policyRunner.quiesced(current.id())) {
                    continue;
                }
                for (PolicyBinding latest : PolicyBinding.matching(List.of(current), type())) {
                    if (!Objects.equals(latest.input().sourceId(), binding.input().sourceId())) {
                        continue;
                    }
                    boolean enabledStorage =
                            sourceStore
                                    .get(latest.input().sourceId())
                                    .filter(
                                            source ->
                                                    source.enabled()
                                                            && "storage-folder"
                                                                    .equals(source.type()))
                                    .isPresent();
                    if (enabledStorage) {
                        policyRunner.runInput(current, latest.input(), SweepKind.BATCH);
                    }
                }
            } catch (RuntimeException e) {
                log.warn(
                        "Could not poll processing folder {}: {}",
                        binding.policy().id(),
                        e.getMessage());
            }
        }
    }
}
