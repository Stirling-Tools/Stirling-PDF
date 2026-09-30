package stirling.software.common.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import stirling.software.common.util.JobContext;

class JobExecutorResourceTest {
    @Test
    void timeoutInterruptsWorkAndPreservesItsOwner() throws Exception {
        var service = new JobExecutorService(null, null, null, null, null, 1000, "1m");
        var interrupted = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        var owner = new java.util.concurrent.atomic.AtomicReference<String>();
        JobContext.setJobId("test-job");
        JobContext.setOwner("owner");
        try {
            Supplier<String> work =
                    () -> {
                        owner.set(JobContext.getOwner());
                        try {
                            release.await();
                        } catch (InterruptedException e) {
                            interrupted.countDown();
                            Thread.currentThread().interrupt();
                        }
                        return "done";
                    };
            assertThatThrownBy(
                            () ->
                                    ReflectionTestUtils.invokeMethod(
                                            service, "executeWithTimeout", work, 100L))
                    .hasRootCauseInstanceOf(java.util.concurrent.TimeoutException.class);
            assertThat(interrupted.await(1, TimeUnit.SECONDS)).isTrue();
            assertThat(owner.get()).isEqualTo("owner");
        } finally {
            release.countDown();
            JobContext.clear();
            service.shutdown();
        }
    }
}
