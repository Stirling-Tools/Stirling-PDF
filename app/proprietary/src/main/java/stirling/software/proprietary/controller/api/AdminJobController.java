package stirling.software.proprietary.controller.api;

import java.util.Map;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.annotation.security.RolesAllowed;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.Response;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.job.JobStats;
import stirling.software.common.service.JobQueue;
import stirling.software.common.service.TaskManager;

/**
 * Admin controller for job management. These endpoints require admin privileges and provide insight
 * into system jobs and queues.
 */
@ApplicationScoped
@Path("/api/v1/admin")
@RequiredArgsConstructor
@Slf4j
@RolesAllowed("ADMIN")
@Tag(name = "Admin Job Management", description = "Admin-only Job  Management APIs")
public class AdminJobController {

    private final TaskManager taskManager;
    private final JobQueue jobQueue;

    /**
     * Get statistics about jobs in the system (admin only)
     *
     * @return Job statistics
     */
    @GET
    @Path("/job/stats")
    @Operation(summary = "Get job statistics")
    @RolesAllowed("ADMIN")
    public Response getJobStats() {
        JobStats stats = taskManager.getJobStats();
        log.info(
                "Admin requested job stats: {} active, {} completed jobs",
                stats.getActiveJobs(),
                stats.getCompletedJobs());
        return Response.ok(stats).build();
    }

    /**
     * Get statistics about the job queue (admin only)
     *
     * @return Queue statistics
     */
    @GET
    @Path("/job/queue/stats")
    @Operation(summary = "Get job queue statistics")
    @RolesAllowed("ADMIN")
    public Response getQueueStats() {
        Map<String, Object> queueStats = jobQueue.getQueueStats();
        log.info("Admin requested queue stats: {} queued jobs", queueStats.get("queuedJobs"));
        return Response.ok(queueStats).build();
    }

    /**
     * Manually trigger cleanup of old jobs (admin only). Covers every user's jobs, unlike the
     * self-service {@code POST /api/v1/general/jobs/cleanup}, which only releases the caller's own.
     *
     * @param force Ignore the retention window and release every finished job now, rather than only
     *     those already past it
     * @return A response indicating how many jobs and files were cleaned up
     */
    @POST
    @Path("/job/cleanup")
    @Operation(
            summary = "Cleanup old jobs",
            description =
                    "Runs the job retention sweep now across all users. With force=true the"
                            + " retention window is ignored and every finished job is released"
                            + " immediately.")
    @RolesAllowed("ADMIN")
    public Response cleanupOldJobs(@QueryParam("force") @DefaultValue("false") boolean force) {
        TaskManager.CleanupSummary summary =
                force
                        ? taskManager.cleanupFinishedJobsNow(jobId -> true)
                        : taskManager.cleanupOldJobs();

        log.info(
                "Admin triggered job cleanup (force={}): removed {} jobs and {} files, {} remaining",
                force,
                summary.jobsRemoved(),
                summary.filesDeleted(),
                summary.jobsRetained());

        return Response.ok(
                        Map.of(
                                "message", "Cleanup complete",
                                "removedJobs", summary.jobsRemoved(),
                                "filesDeleted", summary.filesDeleted(),
                                "remainingJobs", summary.jobsRetained()))
                .build();
    }
}
