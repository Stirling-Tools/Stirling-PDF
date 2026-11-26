package stirling.software.common.pdf.worker;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.awaitility.Awaitility.await;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.stream.IntStream;
import java.util.stream.Stream;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.pdf.worker.FakePdfWorkerMain.TestJob;

class PdfWorkerPoolTest {

    private PdfWorkerPool pool;
    private ExecutorService executor;

    @AfterEach
    void tearDown() {
        if (executor != null) {
            executor.shutdownNow();
        }
        if (pool != null) {
            pool.destroy();
        }
    }

    private PdfWorkerPool pool(int processes, int instances, int maxJobs, Duration jobTimeout) {
        pool =
                new PdfWorkerPool(
                        new PdfWorkerPool.Config(
                                true,
                                processes,
                                instances,
                                maxJobs,
                                Duration.ofMinutes(5),
                                jobTimeout,
                                PdfWorkerLauncher.command(
                                        "64m", FakePdfWorkerMain.class, instances),
                                PdfWorkerLauncher.command("64m", FakePdfWorkerMain.class, 1),
                                false));
        return pool;
    }

    private static String pid(String result) {
        return result.substring(0, result.indexOf(':'));
    }

    private Set<String> runAtOnce(int jobs, Path barrier) throws Exception {
        executor = Executors.newFixedThreadPool(jobs);
        List<Callable<String>> tasks =
                IntStream.range(0, jobs)
                        .<Callable<String>>mapToObj(
                                i ->
                                        () ->
                                                pool.execute(
                                                        new TestJob(
                                                                "barrier",
                                                                barrier.toString(),
                                                                jobs)))
                        .toList();
        Set<String> pids = new HashSet<>();
        for (Future<String> f : executor.invokeAll(tasks)) {
            String result = f.get();
            assertThat(result).endsWith(":met");
            pids.add(pid(result));
        }
        return pids;
    }

    @Test
    void runsJobsInParallelAcrossProcesses(@TempDir Path barrier) throws Exception {
        pool(3, 1, 100, Duration.ofMinutes(1));
        assertThat(runAtOnce(3, barrier))
                .hasSize(3)
                .doesNotContain(String.valueOf(ProcessHandle.current().pid()));
    }

    @Test
    void runsJobsInParallelInsideOneWorker(@TempDir Path barrier) throws Exception {
        pool(1, 3, 100, Duration.ofMinutes(1));
        assertThat(runAtOnce(3, barrier)).hasSize(1);
        assertThat(pool.liveWorkers()).isEqualTo(1);
    }

    @Test
    void jobFailureKeepsTheWorker() throws Exception {
        pool(1, 1, 100, Duration.ofMinutes(1));
        String first = pool.execute(new TestJob("echo", "a", 0));

        assertThatThrownBy(() -> pool.execute(new TestJob("fail", "bad.pdf", 0)))
                .isInstanceOf(PdfWorkerJobException.class)
                .hasMessage("Invalid PDF: bad.pdf");

        assertThat(pid(pool.execute(new TestJob("echo", "b", 0)))).isEqualTo(pid(first));
        assertThat(pool.liveWorkers()).isEqualTo(1);
    }

    @Test
    void aFileThatCrashesTheEngineTwiceIsRejectedAndTheServerCarriesOn() throws Exception {
        pool(1, 1, 100, Duration.ofMinutes(1));
        String first = pool.execute(new TestJob("echo", "a", 0));

        assertThatThrownBy(() -> pool.execute(new TestJob("crash", "x", 0)))
                .isInstanceOf(IOException.class)
                .isNotInstanceOf(PdfWorkerJobException.class)
                .hasMessageContaining("crashed while processing this file");

        String next = pool.execute(new TestJob("echo", "b", 0));
        assertThat(pid(next)).isNotEqualTo(pid(first));
    }

    @Test
    void jobsInFlightBesideACrashAreRetriedAndSucceed(@TempDir Path dir) throws Exception {
        pool(1, 2, 100, Duration.ofMinutes(1));
        executor = Executors.newFixedThreadPool(2);
        Future<String> innocent =
                executor.submit(() -> pool.execute(new TestJob("wait", dir.toString(), 0)));
        await().atMost(Duration.ofSeconds(30)).until(() -> countStarted(dir) == 1);
        String firstWorker = startedPids(dir).getFirst();

        Future<String> poison = executor.submit(() -> pool.execute(new TestJob("crash", "x", 0)));
        await().atMost(Duration.ofSeconds(30)).until(() -> countStarted(dir) == 2);
        Files.writeString(dir.resolve("release"), "");

        String result = innocent.get();
        assertThat(result).endsWith(":released");
        assertThat(pid(result)).isNotEqualTo(firstWorker);
        assertThatThrownBy(poison::get)
                .hasRootCauseInstanceOf(PdfWorkerDiedException.class)
                .hasMessageContaining("crashed while processing this file");
    }

    private static long countStarted(Path dir) throws IOException {
        return startedPids(dir).size();
    }

    private static List<String> startedPids(Path dir) throws IOException {
        try (Stream<Path> files = Files.list(dir)) {
            return files.map(p -> p.getFileName().toString())
                    .filter(name -> name.startsWith("started-"))
                    .map(name -> name.substring("started-".length()))
                    .toList();
        }
    }

    @Test
    void aResultTheServerCannotReadKeepsTheWorker() throws Exception {
        pool(1, 1, 100, Duration.ofMinutes(1));
        String first = pool.execute(new TestJob("echo", "a", 0));

        assertThatThrownBy(() -> pool.execute(new TestJob("unreadable", "x", 0)))
                .isInstanceOf(IllegalStateException.class);

        assertThat(pid(pool.execute(new TestJob("echo", "b", 0)))).isEqualTo(pid(first));
    }

    @Test
    void timeoutKillsTheWorkerWithoutARetry() throws Exception {
        pool(1, 1, 100, Duration.ofSeconds(1));
        assertThatThrownBy(() -> pool.execute(new TestJob("echo", "slow", 10_000)))
                .isInstanceOf(IOException.class)
                .hasMessageContaining("timed out");
        assertThat(pool.quarantineRunning()).isFalse();
        assertThat(pool.execute(new TestJob("echo", "ok", 0))).endsWith(":ok");
    }

    @Test
    void recyclesAWorkerAfterMaxJobs() throws Exception {
        pool(1, 1, 2, Duration.ofMinutes(1));
        Set<String> pids = new HashSet<>();
        for (int i = 0; i < 3; i++) {
            pids.add(pid(pool.execute(new TestJob("echo", "r" + i, 0))));
        }
        assertThat(pids).hasSize(2);
    }

    @Test
    void strayOutputFailsTheWorkerLoudly() throws Exception {
        pool(1, 1, 100, Duration.ofMinutes(1));
        assertThatThrownBy(() -> pool.execute(new TestJob("noise", "x", 0)))
                .isInstanceOf(IOException.class)
                .isNotInstanceOf(PdfWorkerJobException.class);
        assertThat(pool.execute(new TestJob("echo", "ok", 0))).endsWith(":ok");
    }

    @Test
    void disabledPoolRunsInThisJvm() throws Exception {
        pool = PdfWorkerPool.inProcess();
        assertThat(pool.enabled()).isFalse();
        assertThat(pool.execute(new TestJob("echo", "a", 0))).isEqualTo("in-process:a");
    }

    private PdfWorkerPool unstartablePool(boolean inProcessFallback) {
        List<String> missing = List.of("stirling-no-such-java-binary");
        pool =
                new PdfWorkerPool(
                        new PdfWorkerPool.Config(
                                true,
                                1,
                                1,
                                100,
                                Duration.ofMinutes(5),
                                Duration.ofMinutes(1),
                                missing,
                                missing,
                                inProcessFallback));
        return pool;
    }

    @Test
    void aWorkerThatCannotStartFailsTheJobRatherThanRunPdfiumInTheServer() {
        unstartablePool(false);
        assertThatThrownBy(() -> pool.execute(new TestJob("echo", "a", 0)))
                .isInstanceOf(IOException.class)
                .hasMessageContaining("could not start");
    }

    @Test
    void fallsBackInProcessOnlyWhenConfigured() throws Exception {
        unstartablePool(true);
        assertThat(pool.execute(new TestJob("echo", "a", 0))).isEqualTo("in-process:a");
    }

    @Test
    void idleWorkersRetireAndHandTheirMemoryBack() throws Exception {
        pool =
                new PdfWorkerPool(
                        new PdfWorkerPool.Config(
                                true,
                                2,
                                2,
                                100,
                                Duration.ofSeconds(2),
                                Duration.ofMinutes(1),
                                PdfWorkerLauncher.command("64m", FakePdfWorkerMain.class, 2),
                                PdfWorkerLauncher.command("64m", FakePdfWorkerMain.class, 1),
                                false));
        executor = Executors.newFixedThreadPool(4);
        List<Callable<String>> jobs =
                IntStream.range(0, 4)
                        .<Callable<String>>mapToObj(
                                i -> () -> pool.execute(new TestJob("echo", "x", 200)))
                        .toList();
        for (Future<String> f : executor.invokeAll(jobs)) {
            f.get();
        }
        assertThat(pool.liveWorkers()).isPositive();
        await().atMost(Duration.ofSeconds(30)).until(() -> pool.liveWorkers() == 0);
    }

    @Test
    void jobsArrivingDuringShutdownFailRatherThanRunInTheServer() throws Exception {
        pool(1, 1, 100, Duration.ofMinutes(1));
        pool.destroy();
        assertThatThrownBy(() -> pool.execute(new TestJob("echo", "a", 0)))
                .isInstanceOf(IOException.class)
                .hasMessageContaining("shutting down");
    }

    private PdfWorkerPool poolWithoutCommand(boolean inProcessFallback) {
        pool =
                new PdfWorkerPool(
                        new PdfWorkerPool.Config(
                                true,
                                1,
                                1,
                                100,
                                Duration.ofMinutes(5),
                                Duration.ofMinutes(1),
                                null,
                                null,
                                inProcessFallback));
        return pool;
    }

    @Test
    void aWorkerCommandThatCouldNotBeBuiltFailsJobsUnlessFallbackIsOn() throws Exception {
        poolWithoutCommand(false);
        assertThatThrownBy(() -> pool.execute(new TestJob("echo", "a", 0)))
                .isInstanceOf(IOException.class)
                .hasMessageContaining("could not be set up");
        pool.destroy();

        poolWithoutCommand(true);
        assertThat(pool.execute(new TestJob("echo", "a", 0))).isEqualTo("in-process:a");
    }

    @Test
    void mergeJobRoundTripsOverTheWire() throws IOException {
        MergeJob job =
                new MergeJob(
                        List.of(Path.of("a.pdf"), Path.of("b é.pdf")),
                        Path.of("out.pdf"),
                        List.of("A", "B"),
                        true);
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        job.writeRequest(new DataOutputStream(bytes));
        MergeJob read =
                MergeJob.readRequest(
                        new DataInputStream(new ByteArrayInputStream(bytes.toByteArray())));
        assertThat(read).isEqualTo(job);

        ByteArrayOutputStream resultBytes = new ByteArrayOutputStream();
        MergeJob.writeResult(
                new DataOutputStream(resultBytes),
                new MergeJob.Result(new int[] {3, 4}, true, false));
        MergeJob.Result result =
                job.readResult(
                        new DataInputStream(new ByteArrayInputStream(resultBytes.toByteArray())));
        assertThat(result.pageCounts()).containsExactly(3, 4);
        assertThat(result.hasSignatures()).isTrue();
        assertThat(result.signatureCheckFailed()).isFalse();
    }

    @Test
    void settingsShapeThePool() {
        ApplicationProperties.PdfWorkers settings = new ApplicationProperties.PdfWorkers();
        settings.setEnabled("false");
        assertThat(PdfWorkerPool.resolve(settings).command()).isNull();

        settings.setEnabled("auto");
        PdfWorkerPool.Config defaults = PdfWorkerPool.resolve(settings);
        assertThat(defaults.processes()).isEqualTo(2);
        assertThat(defaults.instancesPerWorker()).isBetween(1, 4);
        assertThat(defaults.inProcessFallback()).isFalse();
        assertThat(defaults.command())
                .contains(
                        "-D"
                                + PdfWorkerMain.INSTANCES_PROPERTY
                                + "="
                                + defaults.instancesPerWorker());
        assertThat(defaults.quarantineCommand())
                .contains("-D" + PdfWorkerMain.INSTANCES_PROPERTY + "=1");

        settings.setCount(2);
        settings.setInstancesPerWorker(5);
        PdfWorkerPool.Config custom = PdfWorkerPool.resolve(settings);
        assertThat(custom.processes()).isEqualTo(2);
        assertThat(custom.instancesPerWorker()).isEqualTo(5);
        assertThat(custom.command()).contains("-Xmx1408m");

        System.setProperty("STIRLING_PDF_TAURI_MODE", "true");
        try {
            assertThat(PdfWorkerPool.resolve(settings).command()).isNull();
            settings.setEnabled("true");
            assertThat(PdfWorkerPool.resolve(settings).command()).isNotNull();
        } finally {
            System.clearProperty("STIRLING_PDF_TAURI_MODE");
        }
    }

    @Test
    void autoHeapGrowsWithInstancesAndAnExplicitHeapWins() {
        assertThat(PdfWorkerPool.maxHeap("auto", 1)).isEqualTo("384m");
        assertThat(PdfWorkerPool.maxHeap("auto", 4)).isEqualTo("1152m");
        assertThat(PdfWorkerPool.maxHeap("700m", 4)).isEqualTo("700m");
    }

    @Test
    void argFileQuotingEscapesBackslashesAndQuotes() {
        assertThat(PdfWorkerLauncher.quote("C:\\a b\\\"x\""))
                .isEqualTo("\"C:\\\\a b\\\\\\\"x\\\"\"");
    }
}
