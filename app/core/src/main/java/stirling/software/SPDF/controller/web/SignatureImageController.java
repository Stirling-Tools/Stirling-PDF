package stirling.software.SPDF.controller.web;

import java.io.IOException;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.service.SharedSignatureService;
import stirling.software.common.service.PersonalSignatureServiceInterface;
import stirling.software.common.service.UserServiceInterface;

/**
 * Unified signature image controller that works for both authenticated and unauthenticated users.
 * Uses composition pattern: - Core SharedSignatureService (always available): reads shared
 * signatures - PersonalSignatureService (proprietary, optional): reads personal signatures For
 * authenticated signature management (save/delete), see proprietary SignatureController.
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/general")
public class SignatureImageController {

    private final SharedSignatureService sharedSignatureService;
    private final PersonalSignatureServiceInterface personalSignatureService;
    private final UserServiceInterface userService;

    public SignatureImageController(
            SharedSignatureService sharedSignatureService,
            @Autowired(required = false) PersonalSignatureServiceInterface personalSignatureService,
            @Autowired(required = false) UserServiceInterface userService) {
        this.sharedSignatureService = sharedSignatureService;
        this.personalSignatureService = personalSignatureService;
        this.userService = userService;
    }

    /**
     * Get a signature image (works for both authenticated and unauthenticated users). -
     * Authenticated with proprietary: tries personal first, then shared - Unauthenticated or
     * community: tries shared only
     */
    @GetMapping("/signatures/{fileName}")
    @ApiResponses(
            value = {
                @ApiResponse(
                        responseCode = "404",
                        description = "Signature not found")
            })
    public ResponseEntity<byte[]> getSignature(@PathVariable(name = "fileName") String fileName) {
        try {
            byte[] imageBytes = null;

            // If proprietary service available and user authenticated, try personal folder first
            if (personalSignatureService != null && userService != null) {
                try {
                    String username = userService.getCurrentUsername();
                    imageBytes =
                            personalSignatureService.getPersonalSignatureBytes(username, fileName);
                } catch (Exception e) {
                    // Not found in personal folder or not authenticated, will try shared
                    log.debug("Personal signature not found, trying shared: {}", e.getMessage());
                }
            }

            // If not found in personal (or no personal service), try shared
            if (imageBytes == null) {
                imageBytes = sharedSignatureService.getSharedSignatureBytes(fileName);
            }

            // Determine content type from file extension
            MediaType contentType = MediaType.IMAGE_PNG; // Default
            String lowerFileName = fileName.toLowerCase();
            if (lowerFileName.endsWith(".jpg") || lowerFileName.endsWith(".jpeg")) {
                contentType = MediaType.IMAGE_JPEG;
            }

            return ResponseEntity.ok().contentType(contentType).body(imageBytes);
        } catch (IOException e) {
            log.debug("Signature not found: {}", fileName);
            return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
        }
    }
}
