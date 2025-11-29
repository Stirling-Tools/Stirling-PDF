package stirling.software.SPDF.controller.web;

import java.io.IOException;
import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import stirling.software.SPDF.model.api.signature.SavedSignatureRequest;
import stirling.software.SPDF.model.api.signature.SavedSignatureResponse;
import stirling.software.SPDF.service.SignatureService;
import stirling.software.common.service.UserServiceInterface;

@RestController
@RequestMapping("/api/v1/general")
public class SignatureController {

    private final SignatureService signatureService;

    private final UserServiceInterface userService;

    public SignatureController(
            SignatureService signatureService,
            @Autowired(required = false) UserServiceInterface userService) {
        this.signatureService = signatureService;
        this.userService = userService;
    }

    @GetMapping("/sign/{fileName}")
    public ResponseEntity<byte[]> getSignature(@PathVariable(name = "fileName") String fileName)
            throws IOException {
        String username = "NON_SECURITY_USER";
        if (userService != null) {
            username = userService.getCurrentUsername();
        }
        // Verify access permission
        if (!signatureService.hasAccessToFile(username, fileName)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        byte[] imageBytes = signatureService.getSignatureBytes(username, fileName);

        // Determine content type from file extension
        MediaType contentType = MediaType.IMAGE_PNG; // Default
        String lowerFileName = fileName.toLowerCase();
        if (lowerFileName.endsWith(".jpg") || lowerFileName.endsWith(".jpeg")) {
            contentType = MediaType.IMAGE_JPEG;
        }

        return ResponseEntity.ok().contentType(contentType).body(imageBytes);
    }

    @PostMapping("/signatures")
    public ResponseEntity<SavedSignatureResponse> saveSignature(
            @RequestBody SavedSignatureRequest request) {
        try {
            String username = "NON_SECURITY_USER";
            if (userService != null) {
                username = userService.getCurrentUsername();
            }
            SavedSignatureResponse response = signatureService.saveSignature(username, request);
            return ResponseEntity.ok(response);
        } catch (IOException e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    @GetMapping("/signatures")
    public ResponseEntity<List<SavedSignatureResponse>> listSignatures() {
        try {
            String username = "NON_SECURITY_USER";
            if (userService != null) {
                username = userService.getCurrentUsername();
            }
            List<SavedSignatureResponse> signatures = signatureService.getSavedSignatures(username);
            return ResponseEntity.ok(signatures);
        } catch (IOException e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    @DeleteMapping("/signatures/{signatureId}")
    public ResponseEntity<Void> deleteSignature(@PathVariable String signatureId) {
        try {
            String username = "NON_SECURITY_USER";
            if (userService != null) {
                username = userService.getCurrentUsername();
            }
            signatureService.deleteSignature(username, signatureId);
            return ResponseEntity.noContent().build();
        } catch (IOException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
        }
    }
}
