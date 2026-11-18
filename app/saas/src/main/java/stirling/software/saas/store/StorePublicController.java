package stirling.software.saas.store;

import java.util.Arrays;
import java.util.List;
import java.util.concurrent.TimeUnit;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Hidden;

import lombok.RequiredArgsConstructor;

/**
 * The anonymous half of the store: browse, read a listing, fetch its manifest. Permitted without a
 * session in {@code SupabaseSecurityConfig}; the JWT filter still runs, so a signed-in viewer's
 * star state rides on the same response. Everything returned here is a public DTO with no publisher
 * identity.
 */
@RestController
@RequestMapping("/api/v1/store/public/pipelines")
@Profile("saas")
@RequiredArgsConstructor
@ConditionalOnProperty(name = "stirling.store.enabled", havingValue = "true")
@Hidden
public class StorePublicController {

    private final StoreService storeService;

    @GetMapping
    public ResponseEntity<StoreDtos.ListPage> list(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String sort,
            @RequestParam(required = false) String tools,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false) Integer limit) {
        List<String> toolList =
                tools == null || tools.isBlank()
                        ? List.of()
                        : Arrays.stream(tools.split(","))
                                .map(String::trim)
                                .filter(s -> !s.isEmpty())
                                .toList();
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(60, TimeUnit.SECONDS).cachePublic())
                .body(storeService.list(q, sort, toolList, category, cursor, limit));
    }

    @GetMapping("/{storeId}")
    public ResponseEntity<StoreDtos.ListingDetail> detail(@PathVariable String storeId) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(60, TimeUnit.SECONDS).cachePublic())
                .body(storeService.detail(storeId));
    }

    @GetMapping("/{storeId}/manifest")
    public ResponseEntity<StoreManifest> manifest(@PathVariable String storeId) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(60, TimeUnit.SECONDS).cachePublic())
                .body(storeService.manifest(storeId));
    }
}
