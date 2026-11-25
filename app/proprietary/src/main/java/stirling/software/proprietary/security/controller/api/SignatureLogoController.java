package stirling.software.proprietary.security.controller.api;

import java.io.IOException;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;

import stirling.software.common.service.SignatureLogoStore;

@RestController
@RequestMapping("/api/v1/admin/signature-logo")
@Tag(
        name = "Admin - Signature Logo",
        description = "Admin APIs for the logo faded behind visible certificate signatures")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class SignatureLogoController {

    private final SignatureLogoStore signatureLogoStore;

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            summary = "Set the signature logo",
            description =
                    "Replaces the Stirling PDF logo drawn faded behind visible certificate"
                            + " signatures with the organisation's. PNG or JPEG, up to 2 MB and 4096"
                            + " pixels on a side.")
    public ResponseEntity<Void> upload(@RequestParam("file") MultipartFile file)
            throws IOException {
        SignatureLogoStore.requireUploadSize(file.getSize(), "logo");
        signatureLogoStore.save(file.getBytes());
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping
    @Operation(
            summary = "Reset the signature logo",
            description = "Visible certificate signatures go back to the Stirling PDF logo.")
    public ResponseEntity<Void> delete() throws IOException {
        signatureLogoStore.delete();
        return ResponseEntity.noContent().build();
    }
}
