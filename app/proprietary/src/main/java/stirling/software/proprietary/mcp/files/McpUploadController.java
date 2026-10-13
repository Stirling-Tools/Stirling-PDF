package stirling.software.proprietary.mcp.files;

import java.util.Map;
import java.util.Optional;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Lazy;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.util.HtmlUtils;

import io.swagger.v3.oas.annotations.Hidden;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;

/**
 * The page and endpoint behind an upload link. The link itself is the credential: it names one
 * user, works once and expires, so no sign-in is needed (see {@link McpUploadLinks}).
 */
@Slf4j
@Hidden
@RestController
@RequestMapping("/api/v1/mcp/uploads")
@ConditionalOnProperty(name = "mcp.enabled", havingValue = "true")
public class McpUploadController {

    private final McpUploadLinks links;
    private final McpFiles files;
    private final UserService userService;

    public McpUploadController(
            McpUploadLinks links, McpFiles files, @Lazy UserService userService) {
        this.links = links;
        this.files = files;
        this.userService = userService;
    }

    @GetMapping(value = "/{token}", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> page(@PathVariable String token) {
        Optional<McpUploadLinks.Uploaded> done = links.done(token);
        if (done.isPresent()) {
            return html(HttpStatus.OK, uploadedPage(done.get()));
        }
        // Only looks, so opening the page does not use the link up.
        if (links.isOpen(token)) {
            return html(HttpStatus.OK, formPage());
        }
        return html(HttpStatus.NOT_FOUND, expiredPage());
    }

    @PostMapping(value = "/{token}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<?> upload(
            @PathVariable String token,
            @RequestParam("file") MultipartFile file,
            @RequestHeader(value = "Accept", required = false) String accept) {
        boolean browser = accept != null && accept.contains(MediaType.TEXT_HTML_VALUE);
        Optional<String> owner = links.claim(token);
        User user = owner.flatMap(name -> userService.findByUsernameIgnoreCase(name)).orElse(null);
        if (user == null) {
            return browser
                    ? html(HttpStatus.NOT_FOUND, expiredPage())
                    : json(
                            HttpStatus.NOT_FOUND,
                            Map.of(
                                    "error",
                                    "This upload link has expired or was already used. Ask the"
                                            + " assistant for a new one."));
        }
        if (file.isEmpty()) {
            links.reopen(token, owner.get());
            return browser
                    ? html(HttpStatus.BAD_REQUEST, formPage())
                    : json(HttpStatus.BAD_REQUEST, Map.of("error", "The file is empty."));
        }
        String name =
                file.getOriginalFilename() == null || file.getOriginalFilename().isBlank()
                        ? "upload.pdf"
                        : file.getOriginalFilename();
        try {
            McpFiles.Saved saved =
                    files.save(
                            user,
                            file.getResource(),
                            name,
                            file.getContentType(),
                            file.getSize(),
                            false);
            McpUploadLinks.Uploaded uploaded =
                    new McpUploadLinks.Uploaded(saved.fileId(), saved.name(), saved.size());
            links.complete(token, owner.get(), uploaded);
            return browser
                    ? html(HttpStatus.OK, uploadedPage(uploaded))
                    : json(
                            HttpStatus.OK,
                            Map.of(
                                    "fileId", uploaded.fileId(),
                                    "name", uploaded.name(),
                                    "size", uploaded.size()));
        } catch (McpFiles.McpFileException e) {
            links.reopen(token, owner.get());
            log.warn("MCP upload link: could not store the file: {}", e.getMessage());
            return browser
                    ? html(HttpStatus.INTERNAL_SERVER_ERROR, formPage())
                    : json(HttpStatus.INTERNAL_SERVER_ERROR, Map.of("error", e.getMessage()));
        }
    }

    private static ResponseEntity<String> html(HttpStatus status, String body) {
        return ResponseEntity.status(status).contentType(MediaType.TEXT_HTML).body(body);
    }

    private static ResponseEntity<Map<String, Object>> json(
            HttpStatus status, Map<String, Object> body) {
        return ResponseEntity.status(status).contentType(MediaType.APPLICATION_JSON).body(body);
    }

    private static String formPage() {
        return page(
                "Upload a file to Stirling PDF",
                "<form method=\"post\" enctype=\"multipart/form-data\">"
                        + "<input type=\"file\" name=\"file\" id=\"file\" required>"
                        + "<button type=\"submit\">Upload</button></form>"
                        + "<p class=\"note\">This link works once and expires 15 minutes after"
                        + " the assistant made it.</p>");
    }

    private static String uploadedPage(McpUploadLinks.Uploaded uploaded) {
        return page(
                "Uploaded",
                "<p><b>"
                        + HtmlUtils.htmlEscape(uploaded.name())
                        + "</b> is in Stirling PDF. Go back to your chat and tell the assistant it"
                        + " is uploaded.</p>");
    }

    private static String expiredPage() {
        return page(
                "This link has expired",
                "<p>It was already used, or more than 15 minutes have passed. Ask the assistant"
                        + " for a new upload link.</p>");
    }

    private static String page(String title, String body) {
        return "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">"
                + "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
                + "<title>"
                + title
                + "</title><style>"
                + "body{font:16px system-ui,sans-serif;margin:0;padding:48px 16px;"
                + "background:#f5f7fa;color:#18212c}"
                + "main{max-width:480px;margin:0 auto;background:#fff;border:1px solid #d3dbe5;"
                + "border-radius:12px;padding:24px}"
                + "h1{font-size:22px;margin:0 0 16px}form{display:flex;flex-wrap:wrap;gap:12px}"
                + "button{font:inherit;padding:8px 18px;border:0;border-radius:8px;"
                + "background:#1a6bd6;color:#fff;cursor:pointer}"
                + ".note{color:#586474;font-size:14px;margin-top:16px}"
                + "@media(prefers-color-scheme:dark){body{background:#0e131a;color:#e5eaf1}"
                + "main{background:#151c26;border-color:#2a3443}.note{color:#9ba7b6}}"
                + "</style></head><body><main><h1>"
                + title
                + "</h1>"
                + body
                + "</main></body></html>";
    }
}
