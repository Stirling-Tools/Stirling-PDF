package stirling.software.proprietary.sources.controller;

import org.springframework.context.annotation.Profile;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.sources.model.SourcesResponse;
import stirling.software.proprietary.sources.service.SourcesService;

/**
 * Read-only overview of the channels feeding documents into Stirling, for the admin portal's
 * Sources page. Management of each channel lives in its own surface; this endpoint only reports.
 */
@RestController
@RequestMapping("/api/v1/sources")
@Hidden
@RequiredArgsConstructor
@Tag(name = "Sources", description = "Read-only overview of document ingestion sources")
@Profile("saas")
@PreAuthorize("hasRole('ADMIN')")
public class SourcesController {

    private final SourcesService sourcesService;

    @GetMapping
    @Operation(
            summary = "List ingestion sources",
            description =
                    "Returns the Sources overview: a KPI strip plus one row per source. Currently"
                            + " covers API clients (users holding an API key) with their API-driven"
                            + " document activity over the trailing 24h and 30d.")
    public SourcesResponse list() {
        return sourcesService.overview();
    }
}
