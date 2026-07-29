package stirling.software.proprietary.formdetection.controller;

import java.io.IOException;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Optional;

import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.ResourceRegion;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpRange;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.formdetection.service.FormDetectionModelManager;

/**
 * Streams the installed .onnx to browsers for in-browser inference. Supports resumable range
 * requests with a stable (content-addressed) ETag and a public Cache-Control so each browser
 * fetches the ~200MB model at most once. The file is streamed from disk by Spring's resource
 * converters - never buffered into heap.
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/ai/form-detection-model")
@RequiredArgsConstructor
@Tag(name = "Auto Form Detection")
public class FormDetectionModelServeController {

    private final FormDetectionModelManager manager;

    @GetMapping("/file")
    @Operation(summary = "Stream the installed model (.onnx); supports HTTP range requests")
    public ResponseEntity<Object> serveModel(@RequestHeader HttpHeaders headers)
            throws IOException {
        Optional<Path> active = manager.getActiveModelFile();
        if (active.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        Path path = active.get();
        Resource resource = new FileSystemResource(path);
        long length = resource.contentLength();
        String etag =
                "\""
                        + manager.getActiveEtag()
                                .orElseGet(() -> length + "-" + path.toFile().lastModified())
                        + "\"";
        // cachePublic + maxAge override the interceptor's blanket "no-store" on /api responses.
        CacheControl cacheControl = CacheControl.maxAge(Duration.ofDays(30)).cachePublic();

        List<HttpRange> ranges;
        try {
            ranges = headers.getRange();
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                    .header(HttpHeaders.CONTENT_RANGE, "bytes */" + length)
                    .build();
        }

        if (ranges.isEmpty()) {
            return ResponseEntity.ok()
                    .header(HttpHeaders.ACCEPT_RANGES, "bytes")
                    .eTag(etag)
                    .cacheControl(cacheControl)
                    .contentType(MediaType.APPLICATION_OCTET_STREAM)
                    .contentLength(length)
                    .body(resource);
        }

        // Serve a single region (the resumable-download case). Returning a bare List would lose its
        // generic element type when the method returns ResponseEntity<Object>, leaving the region
        // converter unable to match it.
        HttpRange range = ranges.get(0);
        long start = range.getRangeStart(length);
        long count = Math.min(range.getRangeEnd(length) - start + 1, length - start);
        ResourceRegion region = new ResourceRegion(resource, start, count);
        // No explicit content type: the region converter derives it. Presetting octet-stream makes
        // the ResourceRegion converter's content-negotiation reject the body.
        return ResponseEntity.status(HttpStatus.PARTIAL_CONTENT)
                .header(HttpHeaders.ACCEPT_RANGES, "bytes")
                .eTag(etag)
                .cacheControl(cacheControl)
                .body(region);
    }
}
