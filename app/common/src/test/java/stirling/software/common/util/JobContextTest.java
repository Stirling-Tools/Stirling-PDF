package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class JobContextTest {

    @AfterEach
    void cleanup() {
        JobContext.clear();
    }

    @Test
    @DisplayName("should return null when no job ID is set")
    void returnsNullByDefault() {
        assertNull(JobContext.getJobId());
    }

    @Test
    @DisplayName("should store and retrieve job ID")
    void setAndGet() {
        JobContext.setJobId("job-123");
        assertEquals("job-123", JobContext.getJobId());
    }

    @Test
    @DisplayName("should clear job ID")
    void clearJobId() {
        JobContext.setJobId("job-456");
        JobContext.clear();
        assertNull(JobContext.getJobId());
    }

    @Test
    @DisplayName("should isolate job IDs between threads")
    void threadIsolation() throws Exception {
        JobContext.setJobId("main-job");

        Thread other =
                new Thread(
                        () -> {
                            assertNull(JobContext.getJobId());
                            JobContext.setJobId("other-job");
                            assertEquals("other-job", JobContext.getJobId());
                        });
        other.start();
        other.join();

        assertEquals("main-job", JobContext.getJobId());
    }

    @Test
    @DisplayName("should allow overwriting job ID")
    void overwriteJobId() {
        JobContext.setJobId("first");
        JobContext.setJobId("second");
        assertEquals("second", JobContext.getJobId());
    }
}
