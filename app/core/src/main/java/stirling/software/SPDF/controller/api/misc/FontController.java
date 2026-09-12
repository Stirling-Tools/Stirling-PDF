package stirling.software.SPDF.controller.api.misc;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.service.FontService;
import stirling.software.common.annotations.api.MiscApi;

/**
 * Controller for managing and retrieving available fonts in the system. Provides endpoints to list
 * both standard PDF fonts and system-installed fonts.
 */
@MiscApi
@RestController
@RequestMapping("/api/v1/general")
@RequiredArgsConstructor
@Slf4j
@Tag(name = "Font Management", description = "Manage and retrieve available fonts")
public class FontController {

    private final FontService fontService;

    /**
     * Get all available fonts: standard PDF fonts + system fonts
     *
     * @return List of available font names sorted alphabetically
     */
    @GetMapping("/fonts")
    @Operation(
            summary = "Get all available fonts",
            description =
                    "Returns a list of all available fonts including standard PDF fonts and system-installed fonts. "
                            + "The list is cached for 5 minutes to optimize performance. "
                            + "Fonts are returned in alphabetical order.")
    public ResponseEntity<List<String>> getAvailableFonts() {
        try {
            List<String> fonts = fontService.getAvailableFonts();
            log.info("GET /api/v1/general/fonts returning {} fonts", fonts.size());
            if (fonts.size() > 5) {
                log.debug("First 5 fonts: {}", fonts.subList(0, Math.min(5, fonts.size())));
            }
            return ResponseEntity.ok(fonts);
        } catch (Exception e) {
            log.error("Error getting fonts", e);
            // Return default fonts if error occurs
            List<String> defaults =
                    List.of("Helvetica", "Times-Roman", "Courier", "Arial", "Georgia");
            log.warn("Returning default fonts due to error");
            return ResponseEntity.ok(defaults);
        }
    }

    /** Refresh the font cache Useful after installing new fonts on the system */
    @PostMapping("/fonts/refresh")
    @Operation(
            summary = "Refresh font cache",
            description =
                    "Clears the internal font cache and forces a full system scan for available fonts. "
                            + "Use this endpoint after installing new fonts on the system.")
    public ResponseEntity<Void> refreshFontCache() {
        log.info("POST /api/v1/general/fonts/refresh - Invalidating and rebuilding font cache");
        fontService.invalidateFontCache();
        // Pre-populate cache
        List<String> fonts = fontService.getAvailableFonts();
        log.info("Font cache rebuilt with {} fonts", fonts.size());
        return ResponseEntity.ok().build();
    }
}
