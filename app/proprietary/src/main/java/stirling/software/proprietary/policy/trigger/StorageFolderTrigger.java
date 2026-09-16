package stirling.software.proprietary.policy.trigger;

import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.policy.engine.PolicyRunner;
import stirling.software.proprietary.policy.engine.SourceBatchSettledEvent;
import stirling.software.proprietary.policy.engine.SweepKind;
import stirling.software.proprietary.policy.input.StorageFolderInputSource;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.model.PolicyBinding;
import stirling.software.proprietary.policy.model.TriggerConfig;
import stirling.software.proprietary.policy.source.Source;
import stirling.software.proprietary.policy.source.SourceStore;
import stirling.software.proprietary.policy.store.PolicyStore;
import stirling.software.proprietary.storage.event.StorageFolderArrivalEvent;

/**
 * Runs storage-folder bindings when files arrive. A placement event sweeps just the folder it names
 * so an upload is processed promptly; the periodic poll re-sweeps everything as the safety net for
 * arrivals this instance never saw — another node's placement, or one that landed while it was
 * down. Settled batches prompt another sweep, so a folder drains without waiting for the poll. Each
 * folder drains its current batch before another is submitted. Coordination between backend
 * instances depends on the processed-file ledger and its recovery behaviour.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class StorageFolderTrigger implements PolicyTrigger {
    private final PolicyStore policyStore;
    private final SourceStore sourceStore;
    private final PolicyRunner policyRunner;
    private final ApplicationProperties applicationProperties;

    /** Folders named by arrivals not yet swept, coalesced so a bulk move costs one sweep. */
    private final Set<UUID> pendingArrivals = ConcurrentHashMap.newKeySet();

    private final AtomicBoolean flushScheduled = new AtomicBoolean();
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
        return Set.of(StorageFolderInputSource.TYPE);
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
        pendingArrivals.clear();
        flushScheduled.set(false);
    }

    /**
     * After commit, so the sweep that follows can see the placement it was told about. Handing the
     * work to the scheduler keeps the request thread off the folder listing, and puts arrival
     * sweeps on the same single thread as the poll — two sweeps of one folder can never overlap.
     *
     * <p>{@code fallbackExecution} covers a publisher running outside a transaction, where this
     * would otherwise drop the event without a trace. A sweep is idempotent, so a redundant one
     * costs a listing; a swallowed arrival costs the whole point of the trigger.
     */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void onArrival(StorageFolderArrivalEvent event) {
        requestSweep(event.folderId());
    }

    /** Recheck the live binding before continuing a batch: it may have been paused or removed. */
    @EventListener
    public void onBatchSettled(SourceBatchSettledEvent event) {
        Policy policy = policyStore.get(event.policyId()).orElse(null);
        if (policy == null
                || !policy.enabled()
                || PolicyBinding.matching(List.of(policy), type()).stream()
                        .noneMatch(
                                binding -> event.sourceId().equals(binding.input().sourceId()))) {
            return;
        }
        Source source = liveStorageSource(event.sourceId()).orElse(null);
        if (source == null) {
            return;
        }
        try {
            requestSweep(UUID.fromString(folderIdText(source)));
        } catch (IllegalArgumentException e) {
            log.warn("Could not continue processing folder {}: {}", policy.id(), e.getMessage());
        }
    }

    private void requestSweep(UUID folderId) {
        if (folderId == null) {
            return;
        }
        pendingArrivals.add(folderId);
        scheduleFlush();
    }

    /**
     * One flush is in flight at a time: arrivals during the quiet period join the pending set
     * instead of queueing their own sweep, so moving 200 files sweeps the folder once.
     */
    private synchronized void scheduleFlush() {
        if (scheduler == null || !flushScheduled.compareAndSet(false, true)) {
            return;
        }
        long quietMs = Math.max(0, applicationProperties.getPolicies().getWatchQuietPeriodMs());
        try {
            scheduler.schedule(this::flushArrivals, quietMs, TimeUnit.MILLISECONDS);
        } catch (RejectedExecutionException shuttingDown) {
            flushScheduled.set(false);
        }
    }

    private void flushArrivals() {
        // Cleared before draining: an arrival landing mid-drain schedules the next flush rather
        // than being dropped, at worst costing one extra sweep of a folder already in hand.
        flushScheduled.set(false);
        for (UUID folderId : drainPending()) {
            try {
                sweep(folderId);
            } catch (RuntimeException e) {
                log.warn("Could not sweep folder {} after arrival: {}", folderId, e.getMessage());
            }
        }
    }

    private Set<UUID> drainPending() {
        Set<UUID> drained = Set.copyOf(pendingArrivals);
        pendingArrivals.removeAll(drained);
        return drained;
    }

    private void safeSweep() {
        try {
            sweep();
        } catch (RuntimeException e) {
            log.warn("Could not poll processing folders: {}", e.getMessage(), e);
        }
    }

    void sweep() {
        sweep(null);
    }

    /** Sweeps every storage folder, or only the one given when an arrival named it. */
    void sweep(UUID onlyFolderId) {
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
                            liveStorageSource(latest.input().sourceId())
                                    .filter(source -> watches(source, onlyFolderId))
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

    private Optional<Source> liveStorageSource(String sourceId) {
        return sourceStore
                .get(sourceId)
                .filter(Source::enabled)
                .filter(source -> StorageFolderInputSource.TYPE.equals(source.type()));
    }

    private static String folderIdText(Source source) {
        return String.valueOf(source.options().get("folderId"));
    }

    /** A null target matches every folder; otherwise the source must watch exactly that one. */
    private static boolean watches(Source source, UUID onlyFolderId) {
        return onlyFolderId == null || onlyFolderId.toString().equals(folderIdText(source));
    }
}
