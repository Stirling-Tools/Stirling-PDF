package stirling.software.proprietary.controller.api;

import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.cache.ExternalWriteEvictionService;

@RestController
@RequestMapping("/api/v1/admin/cache")
@Tag(name = "Admin Cache", description = "Second-level cache maintenance")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminCacheEvictionController {

    private final ExternalWriteEvictionService evictionService;

    @PostMapping("/evictions")
    @Operation(
            summary = "Evict cached users and teams after an external database write",
            description =
                    "Call after changing users, roles, settings or teams outside Stirling PDF"
                            + " (Supabase functions, manual SQL). Evicts on every cluster node."
                            + " An identifier that no longer resolves evicts every cached user.")
    public ResponseEntity<Map<String, Object>> evict(
            @RequestBody ExternalWriteEvictionService.Request request) {
        try {
            int evicted = evictionService.evict(request).size();
            return ResponseEntity.ok(Map.of("evicted", evicted));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("error", ex.getMessage()));
        }
    }
}
