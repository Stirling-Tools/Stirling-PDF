package stirling.software.SPDF.controller.api;

import java.util.Optional;
import java.util.concurrent.TimeUnit;

import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.service.EditorFontRegistry;
import stirling.software.SPDF.service.EditorFontRegistry.EditorFontManifest;
import stirling.software.SPDF.service.EditorFontRegistry.FontFile;
import stirling.software.SPDF.service.EditorFontRegistry.Snapshot;
import stirling.software.common.annotations.api.UiDataApi;

@UiDataApi
@RequiredArgsConstructor
public class EditorFontController {

    private static final CacheControl MANIFEST_CACHE = CacheControl.noCache().cachePrivate();
    private static final CacheControl FONT_CACHE =
            CacheControl.maxAge(365, TimeUnit.DAYS).cachePrivate().immutable();

    private final EditorFontRegistry registry;

    @GetMapping("/editor-fonts")
    @Operation(summary = "List the server-provided fonts the PDF text editor can embed")
    public ResponseEntity<EditorFontManifest> manifest() {
        Snapshot snapshot = registry.snapshot();
        return ResponseEntity.ok()
                .cacheControl(MANIFEST_CACHE)
                .eTag(snapshot.etag())
                .body(snapshot.manifest());
    }

    @GetMapping("/editor-fonts/{id}")
    @Operation(summary = "Download one server-provided editor font face by its content hash")
    public ResponseEntity<Resource> font(@PathVariable String id) {
        Optional<FontFile> file = registry.resolve(id);
        if (file.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        FontFile font = file.get();
        return ResponseEntity.ok()
                .cacheControl(FONT_CACHE)
                .eTag(id)
                .header("X-Content-Type-Options", "nosniff")
                .contentType(MediaType.parseMediaType("font/" + font.format()))
                .contentLength(font.size())
                .body(font.resource());
    }
}
