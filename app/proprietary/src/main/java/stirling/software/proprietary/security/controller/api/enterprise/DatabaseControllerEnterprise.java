package stirling.software.proprietary.security.controller.api.enterprise;

import java.util.List;

import org.apache.commons.lang3.tuple.Pair;

import io.quarkus.arc.profile.UnlessBuildProfile;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.annotation.security.RolesAllowed;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.core.Response;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.FileInfo;
import stirling.software.proprietary.security.config.EnterpriseEndpoint;
import stirling.software.proprietary.security.service.DatabaseService;

// TODO: Migration required - @Conditional(H2SQLCondition.class) had no direct Quarkus equivalent.
// H2SQLCondition is an org.springframework.context.annotation.Condition that inspects active
// profiles and datasource URL/type at bean-registration time. Quarkus has no equivalent for an
// arbitrary runtime Condition deciding whether to register a JAX-RS resource. Options: gate the
// endpoints with @io.quarkus.arc.lookup.LookupIfProperty / @io.quarkus.arc.profile.IfBuildProfile
// if the H2 check can be reduced to a build/config property, or add a runtime guard in each method
// that returns 404/disabled when the active datasource is not H2.
@Slf4j
@ApplicationScoped
// Drives the concrete DatabaseService (@UnlessBuildProfile("saas")), so it shares the same gating:
// no tenant-facing DB backup management in the saas flavor.
@UnlessBuildProfile("saas")
@Path("/api/v1/database")
@RolesAllowed("ADMIN")
@EnterpriseEndpoint
@Tag(name = "Database", description = "Database APIs for backup, import, and management")
@RequiredArgsConstructor
public class DatabaseControllerEnterprise {

    private final DatabaseService databaseService;

    @Operation(
            summary = "Delete the last database backup file",
            description =
                    "Only Enterprise - Deletes the last database backup file from the server.")
    @DELETE
    @Path("/deleteLast")
    public Response deleteLastFile() {
        log.info("Deleting last database backup file...");
        List<Pair<FileInfo, Boolean>> results = databaseService.deleteLastBackup();
        return getDeleteAllResults(results);
    }

    @Operation(
            summary = "Delete all database backup files",
            description = "Only Enterprise - Deletes all database backup files from the server.")
    @DELETE
    @Path("/deleteAll")
    public Response deleteAllFiles() {
        log.info("Deleting all database backup files...");
        List<Pair<FileInfo, Boolean>> results = databaseService.deleteAllBackups();
        return getDeleteAllResults(results);
    }

    private Response getDeleteAllResults(List<Pair<FileInfo, Boolean>> results) {
        if (results.isEmpty()) {
            log.info("No backup files found to delete.");
            return Response.ok(new DeleteAllResult(List.of(), List.of(), "noContent")).build();
        }

        List<String> deleted =
                results.stream()
                        .filter(p -> Boolean.TRUE.equals(p.getRight()))
                        .map(p -> p.getLeft().getFileName())
                        .toList();

        List<String> failed =
                results.stream()
                        .filter(p -> !Boolean.TRUE.equals(p.getRight()))
                        .map(p -> p.getLeft().getFileName())
                        .toList();

        log.info("Deleted backup files: {}", deleted);
        if (!failed.isEmpty()) {
            log.warn("Some backup files could not be deleted: {}", failed);
            return Response.status(207) // MULTI_STATUS
                    .entity(new DeleteAllResult(deleted, failed, "partialFailure"))
                    .build();
        }
        DeleteAllResult result = new DeleteAllResult(deleted, failed, "ok");
        log.debug(
                "DeleteAllResult: deleted={}, failed={}, status={}",
                result.deleted,
                result.failed,
                result.status);
        return Response.ok(result).build(); // 200
    }

    private static final class DeleteAllResult {
        public final List<String> deleted;
        public final List<String> failed;
        public final String status;

        public DeleteAllResult(List<String> deleted, List<String> failed, String status) {
            this.deleted = deleted;
            this.failed = failed;
            this.status = status;
        }
    }
}
