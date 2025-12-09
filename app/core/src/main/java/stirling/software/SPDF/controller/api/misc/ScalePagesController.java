package stirling.software.SPDF.controller.api.misc;

import lombok.RequiredArgsConstructor;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import stirling.software.SPDF.service.ScalePagesService;
import stirling.software.SPDF.service.UsageMetricsService;

import java.io.IOException;
import java.security.Principal;

@RestController
@RequestMapping("/api/v1/misc")
@RequiredArgsConstructor
public class ScalePagesController {

    private final ScalePagesService scalePagesService;
    private final UsageMetricsService usageMetricsService;

    @PostMapping("/scale-pages")
    public ResponseEntity<byte[]> scalePages(
            @RequestPart("file") MultipartFile file,
            @RequestParam(defaultValue = "A4") String targetSize,
            @RequestParam(defaultValue = "true") boolean keepAspectRatio,
            Principal principal) throws IOException {

        usageMetricsService.recordUsage(
            "scale-pages",
            principal != null ? principal.getName() : null
        );

        byte[] output = scalePagesService.scalePages(
                file.getBytes(), targetSize, keepAspectRatio);

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=scaled.pdf")
                .contentType(MediaType.APPLICATION_PDF)
                .body(output);
    }
}
