package stirling.software.SPDF.controller.web;

import java.io.IOException;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Instance;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.core.Response;

import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.service.SharedSignatureService;
import stirling.software.common.service.PersonalSignatureServiceInterface;
import stirling.software.common.service.UserServiceInterface;

@Slf4j
@ApplicationScoped
@Path("/api/v1/general")
@Tag(name = "Signature Assets", description = "Retrieve saved signature images")
public class SignatureImageController {

    private final SharedSignatureService sharedSignatureService;
    // MIGRATION: Spring @Autowired(required=false) optional bean -> CDI Instance<>.
    private final Instance<PersonalSignatureServiceInterface> personalSignatureService;
    private final Instance<UserServiceInterface> userService;

    @Inject
    public SignatureImageController(
            SharedSignatureService sharedSignatureService,
            Instance<PersonalSignatureServiceInterface> personalSignatureService,
            Instance<UserServiceInterface> userService) {
        this.sharedSignatureService = sharedSignatureService;
        this.personalSignatureService = personalSignatureService;
        this.userService = userService;
    }

    /**
     * Get a signature image (works for both authenticated and unauthenticated users). -
     * Authenticated with proprietary: tries personal first, then shared - Unauthenticated or
     * community: tries shared only
     */
    @GET
    @Path("/signatures/{fileName}")
    public Response getSignature(@PathParam("fileName") String fileName) {
        try {
            byte[] imageBytes = null;

            // If proprietary service available and user authenticated, try personal folder first
            if (personalSignatureService.isResolvable() && userService.isResolvable()) {
                try {
                    String username = userService.get().getCurrentUsername();
                    imageBytes =
                            personalSignatureService
                                    .get()
                                    .getPersonalSignatureBytes(username, fileName);
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
            String contentType = "image/png"; // Default
            String lowerFileName = fileName.toLowerCase();
            if (lowerFileName.endsWith(".jpg") || lowerFileName.endsWith(".jpeg")) {
                contentType = "image/jpeg";
            }

            return Response.ok(imageBytes).type(contentType).build();
        } catch (IOException e) {
            log.debug("Signature not found: {}", fileName);
            return Response.status(Response.Status.NOT_FOUND).build();
        }
    }
}
