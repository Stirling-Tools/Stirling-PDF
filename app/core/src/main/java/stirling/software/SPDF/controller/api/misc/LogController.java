package stirling.software.SPDF.controller.api.misc;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.InputStreamResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.configuration.InstallationPathConfig;

@Slf4j
@RestController
@RequestMapping("/api/v1/system")
@Tag(name = "System", description = "System level APIs")
@ConditionalOnProperty(name = "debugsystemlog", havingValue = "true", matchIfMissing = false)
public class LogController {

    private static final String INFO_LOG_FILENAME = "info.log";

    @Value("${debugsystemlog:false}")
    private boolean debugSystemLog;

    @GetMapping(value = "/logs/info", produces = MediaType.TEXT_PLAIN_VALUE)
    @Operation(
            summary = "Get application info log",
            description = "Returns the current info log file.")
    @ApiResponses(
            value = {
                @ApiResponse(responseCode = "200", description = "Log file retrieved successfully"),
                @ApiResponse(
                        responseCode = "403",
                        description = "Access to system logs is disabled"),
                @ApiResponse(responseCode = "404", description = "Log file not found"),
                @ApiResponse(responseCode = "500", description = "Internal server error")
            })
    public ResponseEntity<Resource> getInfoLog() throws IOException {
        if (!debugSystemLog) {
            log.warn("Access to system logs is disabled.");
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(null);
        }
        Path logPath = Paths.get(InstallationPathConfig.getLogPath(), INFO_LOG_FILENAME);

        if (Files.notExists(logPath)) {
            log.warn("Requested log file does not exist: {}", logPath.toAbsolutePath());
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(null);
        }

        InputStreamResource resource = new InputStreamResource(Files.newInputStream(logPath));

        return ResponseEntity.ok()
                .contentType(MediaType.TEXT_PLAIN)
                .contentLength(Files.size(logPath))
                .body(resource);
    }
}
