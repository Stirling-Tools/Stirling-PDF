package stirling.software.proprietary.security.controller.api;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.annotations.api.AdminApi;
import stirling.software.common.service.TempFileCleanupService;
import stirling.software.common.service.TempFileCleanupService.CleanupStatus;

/**
 * Admin-only observability endpoints for the scheduled temp-file cleanup loop. Lets operators see
 * the last cycle's outcome and clear the latched abort counter without restarting the JVM.
 */
@AdminApi
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
@Slf4j
public class TempCleanupAdminController {

    private final TempFileCleanupService tempFileCleanupService;

    @GetMapping("/temp-cleanup/status")
    @Operation(
            summary = "Get temp file cleanup status",
            description =
                    "Returns the most recent cleanup cycle's start/end time, duration, deleted"
                            + " count, and the consecutive-failure counter. Use this to confirm"
                            + " the scheduler is making progress.")
    public ResponseEntity<CleanupStatus> getStatus() {
        return ResponseEntity.ok(tempFileCleanupService.getCleanupStatus());
    }

    @PostMapping("/temp-cleanup/reset-failures")
    @Operation(
            summary = "Reset the temp cleanup failure counter",
            description =
                    "Clears the consecutive-failure counter that latches the scheduler after"
                            + " repeated cycle failures. Use after investigating and fixing the"
                            + " underlying issue (e.g. unreachable mount, permissions).")
    public ResponseEntity<CleanupStatus> resetFailures() {
        int cleared = tempFileCleanupService.resetCleanupFailureCounter();
        log.info("Admin manually cleared {} consecutive cleanup failures", cleared);
        return ResponseEntity.ok(tempFileCleanupService.getCleanupStatus());
    }
}
