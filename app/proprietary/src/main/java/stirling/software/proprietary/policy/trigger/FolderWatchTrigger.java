package stirling.software.proprietary.policy.trigger;

import static java.nio.file.StandardWatchEventKinds.ENTRY_CREATE;
import static java.nio.file.StandardWatchEventKinds.ENTRY_MODIFY;

import java.io.IOException;
import java.nio.file.ClosedWatchServiceException;
import java.nio.file.FileSystems;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.WatchKey;
import java.nio.file.WatchService;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.policy.config.FolderAccessGuard;
import stirling.software.proprietary.policy.engine.PolicyRunner;
import stirling.software.proprietary.policy.input.InputSource;
import stirling.software.proprietary.policy.model.InputSpec;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.source.Source;
import stirling.software.proprietary.policy.source.SourceStore;
import stirling.software.proprietary.policy.store.PolicyStore;

/**
 * Fires policies when a file lands in one of their folder sources, rather than polling on a timer.
 *
 * <p>The watch is a latency optimisation, not a source of truth: a periodic reconcile sweep ({@code
 * watchReconcileSeconds}) re-syncs watched dirs and re-runs every policy, covering files that
 * pre-dated the watch, dropped events, and filesystems that emit none (NFS, bind mounts). Redundant
 * runs are harmless since {@link InputSource} does the claiming.
 *
 * <p>Watch state is in memory, so this assumes a single node and rebuilds registrations on restart.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@ConditionalOnBooleanProperty(name = "policies.enabled")
public class FolderWatchTrigger implements PolicyTrigger {

    private static final String TYPE = "folder-watch";

    private final PolicyStore policyStore;
    private final PolicyRunner policyRunner;
    private final List<InputSource> inputSources;
    private final SourceStore sourceStore;
    private final ApplicationProperties applicationProperties;

    private final Map<Path, WatchKey> keysByDir = new ConcurrentHashMap<>();
    private final Map<WatchKey, Path> dirByKey = new ConcurrentHashMap<>();

    private volatile boolean running;

    // Package-visible so tests can drive syncRegistrations() against a real service.
    volatile WatchService watchService;

    private volatile ScheduledExecutorService reconciler;

    @Override
    public String type() {
        return TYPE;
    }

    @Override
    public boolean requiresSource() {
        return true;
    }

    @Override
    public Set<String> supportedSourceTypes() {
        return Set.of(FolderAccessGuard.FOLDER_TYPE);
    }

    @Override
    public void validate(Policy policy) {
        if (watchDirsOf(policy).isEmpty()) {
            throw new IllegalArgumentException(
                    "folder-watch trigger requires at least one watchable (folder) input source");
        }
    }

    @Override
    public synchronized void start() {
        if (watchService != null) {
            return;
        }
        try {
            watchService = FileSystems.getDefault().newWatchService();
        } catch (IOException e) {
            log.error("Could not start folder-watch trigger: {}", e.getMessage(), e);
            return;
        }
        running = true;
        Thread.ofVirtual().name("policy-folder-watch").start(this::watchLoop);
        long reconcileSeconds = applicationProperties.getPolicies().getWatchReconcileSeconds();
        reconciler =
                Executors.newSingleThreadScheduledExecutor(
                        Thread.ofVirtual().name("policy-folder-reconcile-", 0).factory());
        // First reconcile runs immediately so pre-existing files are picked up at startup.
        reconciler.scheduleAtFixedRate(this::safeReconcile, 0, reconcileSeconds, TimeUnit.SECONDS);
        log.info("Folder-watch trigger started (reconcile every {}s)", reconcileSeconds);
    }

    @Override
    public synchronized void stop() {
        running = false;
        if (reconciler != null) {
            reconciler.shutdownNow();
            reconciler = null;
        }
        if (watchService != null) {
            try {
                watchService.close(); // wakes the watch loop with ClosedWatchServiceException
            } catch (IOException e) {
                log.debug("Error closing folder watch service: {}", e.getMessage());
            }
            watchService = null;
        }
        keysByDir.clear();
        dirByKey.clear();
    }

    @Override
    public void onPoliciesChanged() {
        // A created/updated/deleted policy may add or drop a watched directory: register/cancel now
        // instead of waiting up to watchReconcileSeconds for the next reconcile. A no-op until the
        // trigger is started (watchService null), where the first reconcile picks everything up.
        syncRegistrations();
    }

    private void watchLoop() {
        // Capture once: stop() may null the field; close() still wakes take()/poll() on this local.
        WatchService watcher = watchService;
        if (watcher == null) {
            return;
        }
        while (running) {
            WatchKey first;
            try {
                first = watcher.take();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            } catch (ClosedWatchServiceException e) {
                return;
            }
            runForChangedDirs(drainBurst(watcher, first));
        }
    }

    /**
     * Coalesce a burst of file-system events into one set of affected directories: drain everything
     * arriving within the quiet period. Event kinds are irrelevant; any event means "go look".
     */
    private Set<Path> drainBurst(WatchService watcher, WatchKey first) {
        long quietPeriodMs = applicationProperties.getPolicies().getWatchQuietPeriodMs();
        Set<Path> changed = new HashSet<>();
        WatchKey key = first;
        while (key != null) {
            key.pollEvents();
            Path dir = dirByKey.get(key);
            if (dir != null) {
                changed.add(dir);
            }
            key.reset();
            try {
                key = watcher.poll(quietPeriodMs, TimeUnit.MILLISECONDS);
            } catch (ClosedWatchServiceException | InterruptedException e) {
                break;
            }
        }
        return changed;
    }

    /** Run every folder-watch policy that draws from one of the changed directories. */
    void runForChangedDirs(Set<Path> changedDirs) {
        if (changedDirs.isEmpty()) {
            return;
        }
        for (Policy policy : policyStore.findByTriggerType(TYPE)) {
            List<Path> dirs;
            try {
                dirs = watchDirsOf(policy);
            } catch (RuntimeException e) {
                log.warn(
                        "Folder-watch policy {} is misconfigured: {}", policy.id(), e.getMessage());
                continue;
            }
            if (dirs.stream().anyMatch(changedDirs::contains)) {
                log.debug("Folder-watch policy {} ({}) saw activity", policy.id(), policy.name());
                policyRunner.run(policy);
            }
        }
    }

    private void safeReconcile() {
        try {
            syncRegistrations();
            runAll();
        } catch (RuntimeException e) {
            log.error("Folder-watch reconcile failed: {}", e.getMessage(), e);
        }
    }

    /** Reconcile safety net: run every folder-watch policy regardless of watch events. */
    void runAll() {
        for (Policy policy : policyStore.findByTriggerType(TYPE)) {
            try {
                policyRunner.run(policy);
            } catch (RuntimeException e) {
                log.warn(
                        "Folder-watch reconcile run failed for policy {}: {}",
                        policy.id(),
                        e.getMessage());
            }
        }
    }

    /** Register newly-wanted dirs that exist on disk, cancel ones no longer wanted. */
    synchronized void syncRegistrations() {
        if (watchService == null) {
            return;
        }
        Set<Path> desired = desiredDirs();

        keysByDir
                .entrySet()
                .removeIf(
                        entry -> {
                            if (desired.contains(entry.getKey())) {
                                return false;
                            }
                            entry.getValue().cancel();
                            dirByKey.remove(entry.getValue());
                            return true;
                        });

        for (Path dir : desired) {
            if (keysByDir.containsKey(dir)) {
                continue;
            }
            try {
                WatchKey key = dir.register(watchService, ENTRY_CREATE, ENTRY_MODIFY);
                keysByDir.put(dir, key);
                dirByKey.put(key, dir);
                log.info("Watching {} for folder-watch policies", dir);
            } catch (IOException | RuntimeException e) {
                log.warn("Could not watch {}: {}", dir, e.getMessage());
            }
        }
    }

    /** The directories currently registered with the watch service. Visible for tests. */
    Set<Path> watchedDirs() {
        return Set.copyOf(keysByDir.keySet());
    }

    /** Every existing directory any current folder-watch policy wants watched. */
    private Set<Path> desiredDirs() {
        Set<Path> dirs = new HashSet<>();
        for (Policy policy : policyStore.findByTriggerType(TYPE)) {
            try {
                for (Path dir : watchDirsOf(policy)) {
                    if (Files.isDirectory(dir)) {
                        dirs.add(dir);
                    }
                }
            } catch (RuntimeException e) {
                log.warn(
                        "Folder-watch policy {} is misconfigured: {}", policy.id(), e.getMessage());
            }
        }
        return dirs;
    }

    // Absolute + normalised so registration keys and event-time matching compare regardless of how
    // the path was configured.
    private List<Path> watchDirsOf(Policy policy) {
        List<Path> dirs = new ArrayList<>();
        for (String sourceId : policy.sourceIds()) {
            Source source = sourceStore.get(sourceId).orElse(null);
            if (source == null) {
                continue;
            }
            InputSpec spec = source.toInputSpec();
            InputSource inputSource = sourceFor(spec);
            if (inputSource == null) {
                continue;
            }
            for (Path dir : inputSource.watchTargets(spec)) {
                dirs.add(dir.toAbsolutePath().normalize());
            }
        }
        return dirs;
    }

    private InputSource sourceFor(InputSpec spec) {
        return inputSources.stream()
                .filter(source -> source.supports(spec))
                .findFirst()
                .orElse(null);
    }
}
