package stirling.software.proprietary.controller.api;

import java.nio.charset.StandardCharsets;

import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.extern.slf4j.Slf4j;

/**
 * Packages a plain-text string produced by an AI agent as a downloadable file.
 *
 * <p>Lives under {@code /api/v1/ai/tools/} so it is dispatchable by the AI orchestrator via the
 * standard {@code InternalApiClient} allowlist.
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/ai/tools")
@Tag(name = "AI Tools", description = "Dispatchable AI-backed tools.")
public class WriteFileAgentController {

    @PostMapping(value = "/write-file", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            summary = "Package AI-generated text content as a downloadable file",
            description =
                    """
                    Wraps a plain-text string (e.g. Markdown, plain text) produced by an AI agent
                    as a named file download. Used as the terminal plan step for agents that
                    generate text content directly rather than transforming an input PDF.

                    Input: content string + filename  Output: file download  Type: SISO
                    """)
    public ResponseEntity<Resource> writeFile(
            @Parameter(description = "Text content to write", required = true)
                    @RequestParam("content")
                    String content,
            @Parameter(description = "Output filename including extension", required = true)
                    @RequestParam("filename")
                    String filename) {

        log.info("[write-file] filename={} content-length={}", filename, content.length());
        byte[] bytes = content.getBytes(StandardCharsets.UTF_8);
        Resource resource = new ByteArrayResource(bytes);
        HttpHeaders headers = new HttpHeaders();
        headers.setContentDisposition(ContentDisposition.attachment().filename(filename).build());
        return ResponseEntity.ok()
                .headers(headers)
                .contentType(MediaType.TEXT_PLAIN)
                .body(resource);
    }
}
