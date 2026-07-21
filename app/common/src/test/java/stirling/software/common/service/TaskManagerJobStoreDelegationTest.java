package stirling.software.common.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;

import java.time.LocalDateTime;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.test.util.ReflectionTestUtils;

import stirling.software.common.cluster.ClusterBackplane;
import stirling.software.common.cluster.JobStoreEntry;
import stirling.software.common.cluster.JobStoreEntry.JobState;
import stirling.software.common.cluster.inprocess.InProcessClusterBackplane;
import stirling.software.common.cluster.inprocess.InProcessJobStore;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.job.JobResult;

class TaskManagerJobStoreDelegationTest {

    @Mock private FileStorage fileStorage;

    private InProcessJobStore jobStore;
    private ClusterBackplane backplane;
    private TaskManager taskManager;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        jobStore = spy(new InProcessJobStore());
        backplane = new InProcessClusterBackplane(new ApplicationProperties());
        taskManager = new TaskManager(fileStorage, jobStore, backplane);
        ReflectionTestUtils.setField(taskManager, "jobResultExpiryMinutes", 30);
    }

    @Test
    void createTaskWritesPendingEntry() {
        taskManager.createTask("job-1");
        JobStoreEntry entry = jobStore.get("job-1").orElseThrow();
        assertEquals(JobState.PENDING, entry.state());
        assertEquals(backplane.localNodeId(), entry.owningNodeId());
    }

    @Test
    void setCompleteFlipsToComplete() {
        taskManager.createTask("job-2");
        taskManager.setResult("job-2", "ok");
        taskManager.setComplete("job-2");
        JobStoreEntry entry = jobStore.get("job-2").orElseThrow();
        assertEquals(JobState.COMPLETE, entry.state());
    }

    @Test
    void setErrorFlipsToFailed() {
        taskManager.createTask("job-3");
        taskManager.setError("job-3", "boom");
        JobStoreEntry entry = jobStore.get("job-3").orElseThrow();
        assertEquals(JobState.FAILED, entry.state());
        assertEquals("boom", entry.error());
    }

    @Test
    void cleanupOldJobsIsNoopWhenBackplaneIsNotInProcess() {
        ClusterBackplane mockedValkeyBackplane =
                new ClusterBackplane() {
                    @Override
                    public boolean isHealthy() {
                        return true;
                    }

                    @Override
                    public String backplaneType() {
                        return "valkey";
                    }

                    @Override
                    public String localNodeId() {
                        return "node-1";
                    }

                    @Override
                    public boolean shouldRunLocalCleanup() {
                        // Distributed backplanes own job TTL eviction themselves; this mock
                        // mirrors the real ValkeyClusterBackplane override of the default true.
                        return false;
                    }
                };
        TaskManager tm = new TaskManager(fileStorage, jobStore, mockedValkeyBackplane);
        ReflectionTestUtils.setField(tm, "jobResultExpiryMinutes", 30);
        tm.createTask("job-4");
        tm.setComplete("job-4");
        ageJobPastExpiry(tm, "job-4");
        tm.cleanupOldJobs();
        // cleanup must short-circuit before touching jobStore in cluster mode; the backplane
        // TTL owns expiry there. If the gate fired correctly, delete is never called.
        verify(jobStore, never()).delete(any());
    }

    @Test
    void cleanupOldJobsDeletesFromJobStoreWhenBackplaneIsInProcess() {
        taskManager.createTask("job-5");
        taskManager.setComplete("job-5");
        ageJobPastExpiry(taskManager, "job-5");
        taskManager.cleanupOldJobs();
        verify(jobStore).delete("job-5");
    }

    @SuppressWarnings("unchecked")
    private static void ageJobPastExpiry(TaskManager tm, String jobId) {
        var jobResults =
                (java.util.Map<String, JobResult>) ReflectionTestUtils.getField(tm, "jobResults");
        JobResult result = jobResults.get(jobId);
        ReflectionTestUtils.setField(result, "completedAt", LocalDateTime.now().minusHours(2));
        ReflectionTestUtils.setField(result, "complete", true);
    }
}
