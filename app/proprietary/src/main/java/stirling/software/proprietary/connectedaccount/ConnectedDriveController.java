package stirling.software.proprietary.connectedaccount;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.policy.microsoft.ConnectedDriveWriter;
import stirling.software.proprietary.security.model.User;

@Slf4j
@RestController
@RequestMapping("/api/v1/connected-accounts")
@RequiredArgsConstructor
@Tag(name = "Connected accounts", description = "Users' own OneDrive, SharePoint and Google Drive")
public class ConnectedDriveController {

    private static final int MAX_NAME_LENGTH = 255;

    private final ConnectedAccountService service;
    private final ConnectedDriveWriter writer;

    @PostMapping(value = "/{id}/drive/save", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<?> save(
            @PathVariable long id,
            @RequestParam("fileInput") MultipartFile file,
            @RequestParam("driveId") String driveId,
            @RequestParam(value = "itemId", required = false) String itemId,
            @RequestParam(value = "eTag", required = false) String eTag,
            @RequestParam(value = "parentId", required = false) String parentId,
            @RequestParam(value = "name", required = false) String name,
            @AuthenticationPrincipal User user) {
        if (user == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }
        ConnectedAccount account =
                service.findOwned(user, id)
                        .filter(owned -> owned.cloudProvider() == CloudProvider.MICROSOFT)
                        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        ConnectedDriveWriter.Target target = target(driveId, itemId, eTag, parentId, name);
        Path content = null;
        try {
            content = Files.createTempFile("stirling-drive-save-", ".bin");
            file.transferTo(content);
            return ResponseEntity.ok(writer.save(account.getId(), target, content));
        } catch (ConnectedDriveWriter.ConflictException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("code", "conflict", "message", e.getMessage()));
        } catch (AccountReconnectRequiredException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, e.getMessage());
        } catch (IOException e) {
            log.warn("Saving to the connected drive failed: {}", e.getMessage());
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, e.getMessage());
        } finally {
            if (content != null) {
                try {
                    Files.deleteIfExists(content);
                } catch (IOException e) {
                    log.debug("Could not delete {}: {}", content, e.getMessage());
                }
            }
        }
    }

    static ConnectedDriveWriter.Target target(
            String driveId, String itemId, String eTag, String parentId, String name) {
        if (isBlank(driveId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "driveId is required");
        }
        if (!isBlank(itemId)) {
            return new ConnectedDriveWriter.Replace(driveId, itemId, eTag);
        }
        if (isBlank(parentId) || isBlank(name)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "itemId, or parentId and name, are required");
        }
        String trimmed = name.trim();
        if (trimmed.length() > MAX_NAME_LENGTH
                || trimmed.contains("/")
                || trimmed.contains("\\")
                || trimmed.equals(".")
                || trimmed.equals("..")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid file name");
        }
        return new ConnectedDriveWriter.Create(driveId, parentId, trimmed, true);
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
