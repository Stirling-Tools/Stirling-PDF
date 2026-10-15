package stirling.software.proprietary.mcp;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.function.Supplier;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import jakarta.annotation.PreDestroy;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.cluster.ClusterBackplane;
import stirling.software.common.cluster.JobStore;
import stirling.software.common.cluster.JobStoreEntry;
import stirling.software.common.cluster.JobStoreEntry.JobState;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.mcp.tools.McpResponses;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * Hands slow operations back as a job the client polls, before the host's tool-call timeout. Jobs
 * live in the cluster {@link JobStore}, so any node can answer the poll.
 */
@Slf4j
@Component
@ConditionalOnProperty(name = "mcp.enabled", havingValue = "true")
public class McpJobs {

    static final String PREFIX = "mcp-";
    private static final String OWNER = "owner";
    private static final String OPERATION = "operation";
    private static final String RESULT = "result";

    private final JobStore jobStore;
    private final ObjectProvider<ClusterBackplane> backplane;
    private final ObjectMapper mapper;
    private final ApplicationProperties applicationProperties;
    private final ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();

    public McpJobs(
            JobStore jobStore,
            ObjectProvider<ClusterBackplane> backplane,
            ObjectMapper mapper,
            ApplicationProperties applicationProperties) {
        this.jobStore = jobStore;
        this.backplane = backplane;
        this.mapper = mapper;
        this.applicationProperties = applicationProperties;
    }

    @PreDestroy
    void shutdown() {
        executor.shutdown();
    }

    /** Runs {@code work}; past the wait limit it returns a pending result with a job id instead. */
    public ObjectNode run(String operation, String owner, Supplier<ObjectNode> work) {
        int waitSeconds = applicationProperties.getMcp().getSyncWaitSeconds();
        if (waitSeconds <= 0) {
            return work.get();
        }
        SecurityContext security = SecurityContextHolder.getContext();
        CompletableFuture<ObjectNode> future =
                CompletableFuture.supplyAsync(
                        () -> {
                            SecurityContextHolder.setContext(security);
                            try {
                                return work.get();
                            } finally {
                                SecurityContextHolder.clearContext();
                            }
                        },
                        executor);
        try {
            return future.get(waitSeconds, TimeUnit.SECONDS);
        } catch (TimeoutException e) {
            return pending(operation, owner, future);
        } catch (ExecutionException e) {
            Throwable cause = e.getCause() == null ? e : e.getCause();
            log.warn("MCP {} failed", operation, cause);
            return McpResponses.error(
                    mapper, operation + " failed unexpectedly.", McpResponses.Failure.INTERNAL);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return McpResponses.error(mapper, operation + " was interrupted.");
        }
    }

    private ObjectNode pending(String operation, String owner, CompletableFuture<ObjectNode> f) {
        String jobId = PREFIX + UUID.randomUUID();
        Instant started = Instant.now();
        put(
                jobId,
                JobState.RUNNING,
                started,
                null,
                Map.of(OWNER, owner(owner), OPERATION, operation));
        f.whenComplete(
                (result, error) -> {
                    if (error != null || result == null) {
                        put(
                                jobId,
                                JobState.FAILED,
                                started,
                                operation + " failed unexpectedly.",
                                Map.of(OWNER, owner(owner), OPERATION, operation));
                    } else {
                        put(
                                jobId,
                                JobState.COMPLETE,
                                started,
                                null,
                                Map.of(
                                        OWNER,
                                        owner(owner),
                                        OPERATION,
                                        operation,
                                        RESULT,
                                        result.toString()));
                    }
                });
        return McpResponses.pending(mapper, operation, jobId);
    }

    /** The finished result, a still-running note, or an error; only the job's owner sees it. */
    public ObjectNode status(String jobId, String owner) {
        Optional<JobStoreEntry> entry =
                jobId != null && jobId.startsWith(PREFIX) ? jobStore.get(jobId) : Optional.empty();
        Map<String, String> meta = entry.map(JobStoreEntry::resultMeta).orElse(Map.of());
        if (entry.isEmpty() || !owner(owner).equals(meta.get(OWNER))) {
            return McpResponses.error(
                    mapper,
                    "Unknown or expired job '" + jobId + "'.",
                    McpResponses.Failure.NOT_FOUND);
        }
        JobStoreEntry job = entry.get();
        String operation = meta.getOrDefault(OPERATION, "The operation");
        return switch (job.state()) {
            case COMPLETE -> (ObjectNode) mapper.readTree(meta.get(RESULT));
            case FAILED ->
                    McpResponses.error(mapper, job.error(), McpResponses.Failure.OPERATION_FAILED);
            default -> McpResponses.pending(mapper, operation, jobId);
        };
    }

    private void put(
            String jobId, JobState state, Instant started, String error, Map<String, String> meta) {
        Instant completed = state == JobState.RUNNING ? null : Instant.now();
        ClusterBackplane node = backplane.getIfAvailable();
        try {
            jobStore.put(
                    new JobStoreEntry(
                            jobId,
                            state,
                            node == null ? "local" : node.localNodeId(),
                            started,
                            completed,
                            error,
                            List.of(),
                            meta),
                    Duration.ofMinutes(applicationProperties.getMcp().getResultTtlMinutes()));
        } catch (RuntimeException e) {
            log.warn("Could not record MCP job {}: {}", jobId, e.getMessage());
        }
    }

    private static String owner(String owner) {
        return owner == null ? "" : owner;
    }
}
