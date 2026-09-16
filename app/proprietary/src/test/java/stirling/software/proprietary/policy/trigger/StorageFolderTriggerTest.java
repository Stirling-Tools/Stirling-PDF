package stirling.software.proprietary.policy.trigger;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.dao.DataAccessResourceFailureException;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.policy.config.PolicyAccessGuard;
import stirling.software.proprietary.policy.engine.PolicyEngine;
import stirling.software.proprietary.policy.engine.PolicyRunHandle;
import stirling.software.proprietary.policy.engine.PolicyRunner;
import stirling.software.proprietary.policy.engine.SourceBatchSettledEvent;
import stirling.software.proprietary.policy.engine.SweepKind;
import stirling.software.proprietary.policy.input.StorageFolderInputSource;
import stirling.software.proprietary.policy.ledger.InProcessProcessedLedger;
import stirling.software.proprietary.policy.ledger.StorageFileIdentities;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineInput;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.model.PolicyInputs;
import stirling.software.proprietary.policy.model.PolicyRun;
import stirling.software.proprietary.policy.model.TriggerConfig;
import stirling.software.proprietary.policy.source.InProcessSourceDocCounter;
import stirling.software.proprietary.policy.source.InProcessSourceStore;
import stirling.software.proprietary.policy.source.Source;
import stirling.software.proprietary.policy.store.InProcessPolicyStore;
import stirling.software.proprietary.security.configuration.ee.DatabaseLicenseGuard;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.storage.event.StorageFolderArrivalEvent;
import stirling.software.proprietary.storage.model.Folder;
import stirling.software.proprietary.storage.model.StoredFile;
import stirling.software.proprietary.storage.provider.StorageProvider;
import stirling.software.proprietary.storage.repository.FolderRepository;
import stirling.software.proprietary.storage.repository.StoredFileRepository;

/**
 * Polling through the real source, runner and ledger; only tool execution and storage I/O are
 * doubled.
 */
class StorageFolderTriggerTest {
    private final InProcessPolicyStore policies = new InProcessPolicyStore();
    private final InProcessSourceStore sources = new InProcessSourceStore();
    private final InProcessProcessedLedger ledger = spy(new InProcessProcessedLedger());
    private final PolicyEngine engine = mock(PolicyEngine.class);
    private final ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
    private final StoredFileRepository files = mock(StoredFileRepository.class);
    private final FolderRepository folders = mock(FolderRepository.class);
    private final StorageProvider blobs = mock(StorageProvider.class);
    private final UserService users = mock(UserService.class);
    private final ApplicationProperties properties = new ApplicationProperties();
    private final User owner = new User();
    private final Folder folder = new Folder();
    private final Map<Long, StoredFile> stored = new LinkedHashMap<>();
    private final List<String> processed = new CopyOnWriteArrayList<>();
    private final List<Runnable> completions = new CopyOnWriteArrayList<>();
    private volatile boolean holdCompletions;
    private PolicyRunner runner;
    private StorageFolderTrigger trigger;

    @BeforeEach
    void setUp() throws IOException {
        properties.getStorage().setEnabled(true);
        properties.getSecurity().setEnableLogin(true);
        owner.setId(7L);
        owner.setUsername("alice");
        folder.setId(UUID.randomUUID());
        folder.setOwner(owner);
        when(users.findByUsername("alice")).thenReturn(Optional.of(owner));
        when(folders.findByIdAndOwner(folder.getId(), owner)).thenReturn(Optional.of(folder));
        when(files.findAllByFolderIdAndOwner(folder.getId(), owner))
                .thenAnswer(inv -> List.copyOf(stored.values()));
        when(files.findByIdAndOwner(anyLong(), eq(owner)))
                .thenAnswer(inv -> Optional.ofNullable(stored.get(inv.getArgument(0))));
        when(blobs.load(anyString()))
                .thenAnswer(inv -> new ByteArrayResource(inv.<String>getArgument(0).getBytes()));
        StorageFolderInputSource input =
                new StorageFolderInputSource(files, folders, blobs, properties, users);
        runner =
                new PolicyRunner(
                        engine,
                        List.of(input),
                        sources,
                        new InProcessSourceDocCounter(),
                        ledger,
                        properties,
                        mock(PolicyAccessGuard.class),
                        mock(DatabaseLicenseGuard.class),
                        events);
        trigger = new StorageFolderTrigger(policies, sources, runner, properties);
        doAnswer(
                        invocation -> {
                            trigger.onBatchSettled(invocation.getArgument(0));
                            return null;
                        })
                .when(events)
                .publishEvent(any(SourceBatchSettledEvent.class));
        when(engine.runPolicy(any(), any(), any(), any(), any(), any()))
                .thenAnswer(
                        inv -> {
                            Policy policy = inv.getArgument(0);
                            PolicyInputs inputs = inv.getArgument(1);
                            String identity = inv.getArgument(4);
                            inputs.primary().getFirst().getInputStream().close();
                            processed.add(identity);
                            PolicyRun run =
                                    new PolicyRun(
                                            UUID.randomUUID().toString(),
                                            policy.id(),
                                            policy.toDefinition(),
                                            inv.<Source>getArgument(3).id(),
                                            identity,
                                            null);
                            CompletableFuture<PolicyRun> completion = new CompletableFuture<>();
                            Runnable finish =
                                    () -> {
                                        run.complete(List.of());
                                        completion.complete(run);
                                    };
                            if (holdCompletions) completions.add(finish);
                            else finish.run();
                            return new PolicyRunHandle(run.getRunId(), completion);
                        });
    }

    private Policy processingFolder(String id, boolean legacy) {
        Source source =
                sources.save(
                        new Source(
                                id + "-source",
                                "Input",
                                "storage-folder",
                                Map.of("folderId", folder.getId().toString()),
                                true,
                                "alice",
                                1L));
        return policies.save(
                new Policy(
                                id,
                                id,
                                "alice",
                                true,
                                List.of(
                                        new PipelineInput(
                                                source.id(),
                                                legacy
                                                        ? null
                                                        : new TriggerConfig(
                                                                TriggerConfig.STORAGE_FOLDER_WATCH,
                                                                Map.of()))),
                                List.of(),
                                OutputSpec.inline(),
                                1L)
                        .withSurface(Policy.SURFACE_PROCESSING_FOLDER));
    }

    private StoredFile upload(long id) {
        StoredFile file = new StoredFile();
        file.setId(id);
        file.setOwner(owner);
        file.setFolder(folder);
        file.setOriginalFilename(id + ".pdf");
        file.setStorageKey("blob-" + id);
        file.setSizeBytes(10L);
        file.setUpdatedAt(LocalDateTime.of(2026, 9, 15, 12, 0));
        stored.put(id, file);
        return file;
    }

    @Test
    void filesUploadedAfterTheInitialRunProcessWithoutAManualTrigger() {
        processingFolder("p1", false);
        upload(1);
        trigger.sweep();
        upload(2);
        trigger.sweep();
        trigger.sweep();
        assertEquals(List.of("storage:1", "storage:2"), processed);
    }

    @Test
    void existingFoldersWithoutAnExplicitTriggerAlsoPickUpArrivals() {
        processingFolder("p1", true);
        trigger.sweep();
        upload(1);
        trigger.sweep();
        assertEquals(List.of("storage:1"), processed);
    }

    @Test
    void pausePreventsNewWorkAndResumePicksUpTheBacklog() {
        Policy policy = processingFolder("p1", false);
        policies.save(policy.withEnabled(false));
        upload(1);
        trigger.sweep();
        assertTrue(processed.isEmpty());
        policies.save(policy.withEnabled(true));
        trigger.sweep();
        assertEquals(List.of("storage:1"), processed);
    }

    @Test
    void deletedPoliciesAndDisabledSourcesDoNotProcessFiles() {
        Policy policy = processingFolder("p1", true);
        Source source = sources.get(policy.inputs().getFirst().sourceId()).orElseThrow();
        sources.save(
                new Source(
                        source.id(),
                        source.name(),
                        source.type(),
                        source.options(),
                        false,
                        source.owner(),
                        source.teamId()));
        upload(1);
        trigger.sweep();
        assertTrue(processed.isEmpty());
        sources.save(source);
        policies.delete(policy.id());
        trigger.sweep();
        assertTrue(processed.isEmpty());
    }

    @Test
    void restartingTheTriggerDiscoversBacklogWithoutReprocessingSettledFiles() {
        processingFolder("p1", true);
        upload(1);
        trigger.sweep();
        upload(2);
        new StorageFolderTrigger(policies, sources, runner, properties).sweep();
        assertEquals(List.of("storage:1", "storage:2"), processed);
    }

    @Test
    void aBacklogDrainsInBoundedBatchesAndWaitsForTheCurrentBatch() {
        processingFolder("p1", false);
        for (long id = 1; id <= 205; id++) upload(id);
        holdCompletions = true;
        trigger.sweep();
        assertEquals(100, processed.size());
        trigger.sweep();
        assertEquals(100, processed.size());
        completions.forEach(Runnable::run);
        completions.clear();
        trigger.sweep();
        assertEquals(200, processed.size());
        completions.forEach(Runnable::run);
        completions.clear();
        holdCompletions = false;
        trigger.sweep();
        trigger.sweep();
        assertEquals(205, processed.size());
        assertEquals(205, processed.stream().distinct().count());
    }

    @Test
    void anUnreadableBlobDoesNotStrandEarlierClaimsOrBlockLaterFiles() throws IOException {
        Policy policy = processingFolder("p1", false);
        upload(1);
        upload(2);
        upload(3);
        when(blobs.load("blob-2")).thenThrow(new IOException("blob unavailable"));
        trigger.sweep();
        assertEquals(List.of("storage:1", "storage:3"), processed);
        assertTrue(runner.quiesced(policy.id()));
        doReturn(new ByteArrayResource("repaired".getBytes())).when(blobs).load("blob-2");
        trigger.sweep();
        assertEquals(List.of("storage:1", "storage:3", "storage:2"), processed);
    }

    @Test
    void aLedgerFailureStopsDiscoveryWithoutStrandingEarlierClaims() {
        Policy policy = processingFolder("p1", false);
        upload(1);
        upload(2);
        upload(3);
        doThrow(new DataAccessResourceFailureException("ledger unavailable"))
                .doCallRealMethod()
                .when(ledger)
                .claim(eq(policy.id()), eq("storage:2"), anyString(), any(), any());

        trigger.sweep();

        assertEquals(List.of("storage:1"), processed);
        assertTrue(runner.quiesced(policy.id()));
        verify(ledger, never()).claim(eq(policy.id()), eq("storage:3"), anyString(), any(), any());

        trigger.sweep();
        trigger.sweep();

        assertEquals(List.of("storage:1", "storage:2", "storage:3"), processed);
        assertTrue(runner.quiesced(policy.id()));
    }

    @Test
    void deletingAFileDuringDiscoveryDoesNotBlockTheFolder() throws IOException {
        Policy policy = processingFolder("p1", false);
        upload(1);
        upload(2);
        upload(3);
        when(blobs.load("blob-1"))
                .thenAnswer(
                        inv -> {
                            stored.remove(2L);
                            return new ByteArrayResource("first".getBytes());
                        });

        trigger.sweep();

        assertEquals(List.of("storage:1", "storage:3"), processed);
        assertTrue(runner.quiesced(policy.id()));
        upload(4);
        trigger.sweep();
        assertEquals(List.of("storage:1", "storage:3", "storage:4"), processed);
        assertTrue(runner.quiesced(policy.id()));
    }

    @Test
    void oneBrokenFolderDoesNotPreventOtherFoldersFromRunning() {
        Policy broken = processingFolder("p1", false);
        Source source = sources.get(broken.inputs().getFirst().sourceId()).orElseThrow();
        sources.save(
                new Source(
                        source.id(),
                        source.name(),
                        source.type(),
                        Map.of("folderId", "invalid"),
                        true,
                        "alice",
                        1L));
        processingFolder("p2", false);
        upload(1);
        trigger.sweep();
        assertEquals(List.of("storage:1"), processed);
    }

    @Test
    void manualPoliciesAndDiskFoldersDoNotGetStoragePolling() {
        Policy manual = processingFolder("p1", true);
        policies.save(manual.withSurface(Policy.SURFACE_POLICY));
        Policy disk = processingFolder("p2", true);
        Source source = sources.get(disk.inputs().getFirst().sourceId()).orElseThrow();
        sources.save(
                new Source(
                        source.id(),
                        source.name(),
                        "folder",
                        Map.of("directory", "/tmp"),
                        true,
                        "alice",
                        1L));
        upload(1);
        trigger.sweep();
        assertTrue(processed.isEmpty());
    }

    @Test
    void storageDisabledDoesNotPoll() {
        processingFolder("p1", true);
        upload(1);
        properties.getStorage().setEnabled(false);
        trigger.sweep();
        properties.getStorage().setEnabled(true);
        properties.getSecurity().setEnableLogin(false);
        trigger.sweep();
        assertTrue(processed.isEmpty());
        verifyNoInteractions(files);
    }

    @Test
    void aFolderPausedAfterListingIsRecheckedBeforeDispatch() {
        Policy policy = processingFolder("p1", false);
        upload(1);
        InProcessPolicyStore changingStore = spy(policies);
        doAnswer(
                        inv -> {
                            Object listed = inv.callRealMethod();
                            policies.save(policy.withEnabled(false));
                            return listed;
                        })
                .when(changingStore)
                .findBindingsByTriggerType(TriggerConfig.STORAGE_FOLDER_WATCH);
        new StorageFolderTrigger(changingStore, sources, runner, properties).sweep();
        assertTrue(processed.isEmpty());
    }

    @Test
    void anAdmissionFailureForOneFolderDoesNotStopOtherFolders() {
        Policy denied = processingFolder("p1", false);
        processingFolder("p2", false);
        upload(1);
        PolicyRunner guarded = spy(runner);
        doThrow(new IllegalStateException("Allowance unavailable"))
                .when(guarded)
                .runInput(
                        eq(denied),
                        any(),
                        eq(stirling.software.proprietary.policy.engine.SweepKind.BATCH));
        new StorageFolderTrigger(policies, sources, guarded, properties).sweep();
        assertEquals(List.of("storage:1"), processed);
    }

    @Test
    void startingTheTriggerImmediatelyChecksTheBacklog() {
        processingFolder("p1", true);
        upload(1);
        try {
            trigger.start();
            trigger.start();
            verify(engine, timeout(5000))
                    .runPolicy(any(), any(), any(), any(), eq("storage:1"), any());
        } finally {
            trigger.stop();
        }
    }

    @Test
    void anArrivalSweepsOnlyTheFolderItNames() {
        processingFolder("p1", false);
        upload(1);
        Folder other = otherFolder();
        processingFolderIn("p2", other);
        StoredFile elsewhere = uploadTo(2, other);

        trigger.sweep(other.getId());

        assertEquals(List.of(identityOf(elsewhere)), processed);
    }

    @Test
    void anArrivalRunsWithoutWaitingForTheNextPoll() throws Exception {
        // A long poll interval leaves the arrival as the only thing that can start this run.
        processingFolder("p1", false);
        try {
            startAfterEmptySweep();
            upload(1);
            clearInvocations(ledger);

            trigger.onArrival(new StorageFolderArrivalEvent(folder.getId()));

            awaitProcessed(1);
        } finally {
            trigger.stop();
        }
    }

    @Test
    void aBurstOfArrivalsCostsOneSweep() throws Exception {
        processingFolder("p1", false);
        try {
            startAfterEmptySweep();
            holdCompletions = true;
            upload(1);
            upload(2);
            upload(3);
            clearInvocations(ledger);

            for (int i = 0; i < 3; i++) {
                trigger.onArrival(new StorageFolderArrivalEvent(folder.getId()));
            }

            awaitProcessed(3);
            // Coalesced: three placements enumerate the folder once, not once each.
            verify(ledger, times(1)).statesFor(eq("p1"), any());
        } finally {
            trigger.stop();
        }
    }

    @Test
    void aBacklogContinuesWhenEachBatchSettlesWithoutWaitingForThePoll() throws Exception {
        processingFolder("p1", false);
        try {
            startAfterEmptySweep();
            clearInvocations(files);
            holdCompletions = true;
            for (long id = 1; id <= 205; id++) upload(id);

            trigger.onArrival(new StorageFolderArrivalEvent(folder.getId()));
            awaitCompletions(100);
            assertEquals(100, processed.size());
            List<Runnable> first = List.copyOf(completions);
            completions.clear();
            first.subList(0, 99).forEach(Runnable::run);
            verifyNoInteractions(events);

            first.getLast().run();
            awaitCompletions(100);
            assertEquals(200, processed.size());
            finishBatch();
            awaitCompletions(5);
            assertEquals(205, processed.size());
            finishBatch();

            verify(files, timeout(5000).times(4)).findAllByFolderIdAndOwner(folder.getId(), owner);
            verify(events, times(3)).publishEvent(any(SourceBatchSettledEvent.class));
            assertEquals(205, processed.stream().distinct().count());
        } finally {
            trigger.stop();
        }
    }

    @Test
    void anArrivalDuringAManualRunContinuesAfterThatRunSettles() throws Exception {
        Policy policy = processingFolder("p1", false);
        trigger = spy(trigger);
        try {
            startAfterEmptySweep();
            holdCompletions = true;
            upload(1);
            runner.run(policy, SweepKind.USER);
            upload(2);

            trigger.onArrival(new StorageFolderArrivalEvent(folder.getId()));
            verify(trigger, timeout(5000)).sweep(folder.getId());
            assertEquals(List.of("storage:1"), processed);

            finishBatch();
            awaitCompletions(1);
            assertEquals(List.of("storage:1", "storage:2"), processed);
        } finally {
            trigger.stop();
        }
    }

    @Test
    void pausingBeforeCompletionPreventsTheNextBatch() throws Exception {
        Policy policy = processingFolder("p1", false);
        trigger = spy(trigger);
        try {
            startAfterEmptySweep();
            holdCompletions = true;
            for (long id = 1; id <= 101; id++) upload(id);
            trigger.onArrival(new StorageFolderArrivalEvent(folder.getId()));
            awaitCompletions(100);
            policies.save(policy.withEnabled(false));

            finishBatch();

            verify(events).publishEvent(any(SourceBatchSettledEvent.class));
            verify(trigger, after(750).times(1)).sweep(folder.getId());
            assertEquals(100, processed.size());
        } finally {
            trigger.stop();
        }
    }

    private void startAfterEmptySweep() throws InterruptedException {
        properties.getPolicies().setStorageFolderSweepSeconds(3600);
        CountDownLatch startup = new CountDownLatch(1);
        doAnswer(
                        invocation -> {
                            Object result = invocation.callRealMethod();
                            startup.countDown();
                            return result;
                        })
                .when(ledger)
                .deleteUnseen(eq("p1"), anyLong());
        trigger.start();
        assertTrue(
                startup.await(5, TimeUnit.SECONDS), "Startup must finish listing before uploads");
    }

    private void awaitCompletions(int expected) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 5_000;
        while (completions.size() < expected && System.currentTimeMillis() < deadline) {
            Thread.sleep(10);
        }
        assertEquals(expected, completions.size());
    }

    private void finishBatch() {
        List<Runnable> batch = List.copyOf(completions);
        completions.clear();
        batch.forEach(Runnable::run);
    }

    /** Waits for the arrival flush, which runs on the trigger's own scheduler thread. */
    private void awaitProcessed(int expected) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 5_000;
        while (processed.size() < expected && System.currentTimeMillis() < deadline) {
            Thread.sleep(10);
        }
        assertEquals(expected, processed.size());
    }

    private Folder otherFolder() {
        Folder other = new Folder();
        other.setId(UUID.randomUUID());
        other.setOwner(owner);
        when(folders.findByIdAndOwner(other.getId(), owner)).thenReturn(Optional.of(other));
        when(files.findAllByFolderIdAndOwner(other.getId(), owner))
                .thenAnswer(
                        inv ->
                                stored.values().stream()
                                        .filter(f -> other.equals(f.getFolder()))
                                        .toList());
        return other;
    }

    private Policy processingFolderIn(String id, Folder target) {
        Source source =
                sources.save(
                        new Source(
                                id + "-source",
                                "Input",
                                "storage-folder",
                                Map.of("folderId", target.getId().toString()),
                                true,
                                "alice",
                                1L));
        return policies.save(
                new Policy(
                                id,
                                id,
                                "alice",
                                true,
                                List.of(
                                        new PipelineInput(
                                                source.id(),
                                                new TriggerConfig(
                                                        TriggerConfig.STORAGE_FOLDER_WATCH,
                                                        Map.of()))),
                                List.of(),
                                OutputSpec.inline(),
                                1L)
                        .withSurface(Policy.SURFACE_PROCESSING_FOLDER));
    }

    private StoredFile uploadTo(long id, Folder target) {
        StoredFile file = upload(id);
        file.setFolder(target);
        return file;
    }

    private static String identityOf(StoredFile file) {
        return StorageFileIdentities.identity(file);
    }
}
