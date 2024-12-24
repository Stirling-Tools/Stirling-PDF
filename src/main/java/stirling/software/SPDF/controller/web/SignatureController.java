package stirling.software.SPDF.controller.web;

import java.io.IOException;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;

import stirling.software.SPDF.controller.api.pipeline.UserServiceInterface;
import stirling.software.SPDF.service.SignatureService;

@Controller
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
        return ResponseEntity.ok()
                .contentType( // Adjust based on file type
                        MediaType.IMAGE_JPEG)
                .body(imageBytes);
    }
}
