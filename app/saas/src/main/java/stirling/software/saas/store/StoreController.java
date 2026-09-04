package stirling.software.saas.store;

import java.util.List;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Hidden;

import lombok.RequiredArgsConstructor;

/**
 * The signed-in half of the store: publish, republish, remove, star, record an install, and the
 * team's own listings. Authentication comes from the SaaS chain ({@code anyRequest().authenticated}
 * ); authorisation (team leader to publish, membership for the team view) is checked in {@link
 * StoreService} against the caller, never against a body or path value.
 */
@RestController
@RequestMapping("/api/v1/store")
@Profile("saas")
@RequiredArgsConstructor
@ConditionalOnProperty(name = "stirling.store.enabled", havingValue = "true")
@Hidden
public class StoreController {

    private final StoreService storeService;

    @PostMapping("/publish/preflight")
    public PreflightReport preflight(@RequestBody PublishRequest request) {
        return storeService.preflight(request);
    }

    @PostMapping("/publish")
    public ResponseEntity<StoreDtos.ListingDetail> publish(@RequestBody PublishRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(storeService.publish(request));
    }

    @PostMapping("/pipelines/{storeId}/republish")
    public StoreDtos.ListingDetail republish(
            @PathVariable String storeId, @RequestBody PublishRequest request) {
        return storeService.republish(storeId, request);
    }

    @DeleteMapping("/pipelines/{storeId}")
    public ResponseEntity<Void> remove(@PathVariable String storeId) {
        storeService.remove(storeId);
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/pipelines/{storeId}/star")
    public StoreDtos.StarResponse star(@PathVariable String storeId) {
        return storeService.setStar(storeId, true);
    }

    @DeleteMapping("/pipelines/{storeId}/star")
    public StoreDtos.StarResponse unstar(@PathVariable String storeId) {
        return storeService.setStar(storeId, false);
    }

    @PostMapping("/pipelines/{storeId}/install")
    public StoreDtos.InstallResponse install(
            @PathVariable String storeId,
            @RequestBody(required = false) StoreDtos.InstallRequest body) {
        return storeService.recordInstall(storeId, body == null ? null : body.target());
    }

    @GetMapping("/team/pipelines")
    public List<StoreDtos.TeamListing> teamListings() {
        return storeService.teamListings();
    }

    @GetMapping("/starred")
    public List<StoreDtos.ListingSummary> starred() {
        return storeService.starred();
    }

    /** A blocked publish is a client error with the full report as its body, not a bare 400. */
    @ExceptionHandler(StoreService.PublishBlockedException.class)
    public ResponseEntity<PreflightReport> blocked(StoreService.PublishBlockedException e) {
        return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY).body(e.getReport());
    }
}
