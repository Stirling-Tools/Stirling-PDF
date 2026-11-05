package stirling.software.common.pdf.worker;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.nio.file.Path;
import java.time.Duration;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import stirling.software.common.pdf.worker.FakePdfWorkerMain.TestJob;

class PdfWorkerPoolTest {

    private PdfWorkerPool pool;

    @AfterEach
    void tearDown() {
        if (pool != null) {
            pool.destroy();
        }
    }

    private PdfWorkerPool pool(int size, int maxJobs, Duration jobTimeout) throws IOException {
        List<String> command = PdfWorkerLauncher.command("64m", FakePdfWorkerMain.class);
        pool =
                new PdfWorkerPool(
                        new PdfWorkerPool.Config(
                                size, maxJobs, Duration.ofMinutes(5), jobTimeout, command));
        return pool;
    }

    private static String pid(String result) {
        return result.substring(0, result.indexOf(':'));
    }

    @Test
    void runsJobsInParallelAcrossProcesses() throws Exception {
        pool(3, 100, Duration.ofMinutes(1));
        // Warm three workers so the timed run measures jobs, not JVM start-up.
        runConcurrently(3, 1500);
        long started = System.nanoTime();
        Set<String> pids = runConcurrently(3, 1500);
        long elapsedMillis = (System.nanoTime() - started) / 1_000_000;

        assertThat(pids).hasSize(3).doesNotContain(String.valueOf(ProcessHandle.current().pid()));
        assertThat(elapsedMillis).isLessThan(3000);
    }

    private Set<String> runConcurrently(int jobs, int sleepMillis) throws Exception {
        ExecutorService executor = Executors.newFixedThreadPool(jobs);
        try {
            List<Callable<String>> tasks =
                    java.util.stream.IntStream.range(0, jobs)
                            .<Callable<String>>mapToObj(
                                    i ->
                                            () ->
                                                    pool.execute(
                                                            new TestJob(
                                                                    "echo", "j" + i, sleepMillis)))
                            .toList();
            Set<String> pids = new HashSet<>();
            for (Future<String> f : executor.invokeAll(tasks)) {
                pids.add(pid(f.get()));
            }
            return pids;
        } finally {
            executor.shutdownNow();
        }
    }

    @Test
    void jobFailureKeepsTheWorker() throws Exception {
        pool(1, 100, Duration.ofMinutes(1));
        String first = pool.execute(new TestJob("echo", "a", 0));

        assertThatThrownBy(() -> pool.execute(new TestJob("fail", "bad.pdf", 0)))
                .isInstanceOf(PdfWorkerJobException.class)
                .hasMessage("Invalid PDF: bad.pdf");

        assertThat(pid(pool.execute(new TestJob("echo", "b", 0)))).isEqualTo(pid(first));
        assertThat(pool.liveWorkers()).isEqualTo(1);
    }

    @Test
    void crashFailsOnlyThatJobAndTheNextGetsAFreshWorker() throws Exception {
        pool(1, 100, Duration.ofMinutes(1));
        String first = pool.execute(new TestJob("echo", "a", 0));

        assertThatThrownBy(() -> pool.execute(new TestJob("crash", "x", 0)))
                .isInstanceOf(IOException.class)
                .isNotInstanceOf(PdfWorkerJobException.class)
                .hasMessageContaining("exited unexpectedly");

        String next = pool.execute(new TestJob("echo", "b", 0));
        assertThat(pid(next)).isNotEqualTo(pid(first));
    }

    @Test
    void timeoutKillsTheWorker() throws Exception {
        pool(1, 100, Duration.ofSeconds(1));
        assertThatThrownBy(() -> pool.execute(new TestJob("echo", "slow", 10_000)))
                .isInstanceOf(IOException.class)
                .hasMessageContaining("timed out");
        assertThat(pool.execute(new TestJob("echo", "ok", 0))).endsWith(":ok");
    }

    @Test
    void recyclesAWorkerAfterMaxJobs() throws Exception {
        pool(1, 2, Duration.ofMinutes(1));
        Set<String> pids = new HashSet<>();
        for (int i = 0; i < 3; i++) {
            pids.add(pid(pool.execute(new TestJob("echo", "r" + i, 0))));
        }
        assertThat(pids).hasSize(2);
    }

    @Test
    void strayOutputFailsTheWorkerLoudly() throws Exception {
        pool(1, 100, Duration.ofMinutes(1));
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

    @Test
    void fallsBackInProcessWhenAWorkerCannotStart() throws Exception {
        pool =
                new PdfWorkerPool(
                        new PdfWorkerPool.Config(
                                1,
                                100,
                                Duration.ofMinutes(5),
                                Duration.ofMinutes(1),
                                List.of("stirling-no-such-java-binary")));
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
    void settingsSwitchThePoolOffAndAutoStaysOffOnDesktop() {
        stirling.software.common.model.ApplicationProperties.PdfWorkers settings =
                new stirling.software.common.model.ApplicationProperties.PdfWorkers();
        settings.setEnabled("false");
        assertThat(PdfWorkerPool.resolve(settings).command()).isNull();

        settings.setEnabled("auto");
        assertThat(PdfWorkerPool.resolve(settings).size()).isEqualTo(2);
        settings.setCount(4);
        assertThat(PdfWorkerPool.resolve(settings).command()).isNotNull();
        assertThat(PdfWorkerPool.resolve(settings).size()).isEqualTo(4);

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
    void argFileQuotingEscapesBackslashesAndQuotes() {
        assertThat(PdfWorkerLauncher.quote("C:\\a b\\\"x\""))
                .isEqualTo("\"C:\\\\a b\\\\\\\"x\\\"\"");
    }
}
