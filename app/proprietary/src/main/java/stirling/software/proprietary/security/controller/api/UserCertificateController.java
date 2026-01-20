package stirling.software.proprietary.security.controller.api;

import java.security.Principal;
import java.util.Optional;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.model.UserServerCertificateEntity;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.service.UserServerCertificateService;

@RestController
@RequestMapping("/api/v1/user/certificate")
@Slf4j
@Tag(name = "User Certificate", description = "APIs for user personal certificate management")
@RequiredArgsConstructor
public class UserCertificateController {

    private final UserServerCertificateService userCertificateService;
    private final UserRepository userRepository;

    @GetMapping("/info")
    @Operation(
            summary = "Get user certificate information",
            description = "Returns information about the current user's personal certificate")
    public ResponseEntity<CertificateInfoResponse> getUserCertificateInfo(Principal principal) {
        if (principal == null) {
            return ResponseEntity.status(401).build();
        }

        try {
            User user =
                    userRepository
                            .findByUsernameIgnoreCase(principal.getName())
                            .orElseThrow(() -> new IllegalArgumentException("User not found"));

            Optional<UserServerCertificateEntity> certOpt =
                    userCertificateService.getCertificateInfo(user.getId());

            if (certOpt.isEmpty()) {
                return ResponseEntity.ok(
                        new CertificateInfoResponse(
                                false, null, null, null, null, null, null, null));
            }

            UserServerCertificateEntity cert = certOpt.get();
            return ResponseEntity.ok(
                    new CertificateInfoResponse(
                            true,
                            cert.getCertificateType().toString(),
                            cert.getSubjectDn(),
                            cert.getIssuerDn(),
                            cert.getValidFrom() != null ? cert.getValidFrom().toString() : null,
                            cert.getValidTo() != null ? cert.getValidTo().toString() : null,
                            cert.getCreatedAt() != null ? cert.getCreatedAt().toString() : null,
                            cert.getUpdatedAt() != null ? cert.getUpdatedAt().toString() : null));
        } catch (Exception e) {
            log.error("Failed to get user certificate info", e);
            return ResponseEntity.internalServerError().build();
        }
    }

    @PostMapping("/generate")
    @Operation(
            summary = "Generate new user certificate",
            description = "Generate a new self-signed certificate for the current user")
    public ResponseEntity<String> generateUserCertificate(Principal principal) {
        if (principal == null) {
            return ResponseEntity.status(401).build();
        }

        try {
            User user =
                    userRepository
                            .findByUsernameIgnoreCase(principal.getName())
                            .orElseThrow(() -> new IllegalArgumentException("User not found"));

            // Delete existing if any
            userCertificateService.deleteUserCertificate(user.getId());

            // Generate new
            userCertificateService.generateUserCertificate(user);

            return ResponseEntity.ok("User certificate generated successfully");
        } catch (Exception e) {
            log.error("Failed to generate user certificate", e);
            return ResponseEntity.internalServerError()
                    .body("Failed to generate certificate: " + e.getMessage());
        }
    }

    @PostMapping("/upload")
    @Operation(
            summary = "Upload user certificate",
            description =
                    "Upload a custom PKCS12 certificate file to be used as the user's personal certificate")
    public ResponseEntity<String> uploadUserCertificate(
            Principal principal,
            @Parameter(description = "PKCS12 certificate file", required = true)
                    @RequestParam("file")
                    MultipartFile file,
            @Parameter(description = "Certificate password", required = true)
                    @RequestParam("password")
                    String password) {

        if (principal == null) {
            return ResponseEntity.status(401).build();
        }

        if (file.isEmpty()) {
            return ResponseEntity.badRequest().body("Certificate file cannot be empty");
        }

        if (!file.getOriginalFilename().toLowerCase().endsWith(".p12")
                && !file.getOriginalFilename().toLowerCase().endsWith(".pfx")) {
            return ResponseEntity.badRequest()
                    .body("Only PKCS12 (.p12 or .pfx) files are supported");
        }

        try {
            User user =
                    userRepository
                            .findByUsernameIgnoreCase(principal.getName())
                            .orElseThrow(() -> new IllegalArgumentException("User not found"));

            userCertificateService.uploadUserCertificate(user, file.getInputStream(), password);
            return ResponseEntity.ok("User certificate uploaded successfully");
        } catch (IllegalArgumentException e) {
            log.warn("Invalid certificate upload: {}", e.getMessage());
            return ResponseEntity.badRequest().body("Invalid certificate or password");
        } catch (Exception e) {
            log.error("Failed to upload user certificate", e);
            return ResponseEntity.internalServerError().body("Failed to upload certificate");
        }
    }

    @DeleteMapping
    @Operation(
            summary = "Delete user certificate",
            description = "Delete the current user's personal certificate")
    public ResponseEntity<String> deleteUserCertificate(Principal principal) {
        if (principal == null) {
            return ResponseEntity.status(401).build();
        }

        try {
            User user =
                    userRepository
                            .findByUsernameIgnoreCase(principal.getName())
                            .orElseThrow(() -> new IllegalArgumentException("User not found"));

            userCertificateService.deleteUserCertificate(user.getId());
            return ResponseEntity.ok("User certificate deleted successfully");
        } catch (Exception e) {
            log.error("Failed to delete user certificate", e);
            return ResponseEntity.internalServerError().body("Failed to delete certificate");
        }
    }

    @GetMapping("/download")
    @Operation(
            summary = "Download user certificate",
            description =
                    "Download the user's public certificate in DER format for validation purposes")
    public ResponseEntity<byte[]> downloadUserCertificate(Principal principal) {
        if (principal == null) {
            return ResponseEntity.status(401).build();
        }

        try {
            User user =
                    userRepository
                            .findByUsernameIgnoreCase(principal.getName())
                            .orElseThrow(() -> new IllegalArgumentException("User not found"));

            if (!userCertificateService.hasUserCertificate(user.getId())) {
                return ResponseEntity.notFound().build();
            }

            // Get the KeyStore and extract the public certificate
            java.security.KeyStore keyStore = userCertificateService.getUserKeyStore(user.getId());
            java.security.cert.X509Certificate cert =
                    (java.security.cert.X509Certificate)
                            keyStore.getCertificate(
                                    keyStore.aliases().nextElement()); // Get first alias
            byte[] certBytes = cert.getEncoded();

            return ResponseEntity.ok()
                    .header(
                            HttpHeaders.CONTENT_DISPOSITION,
                            "attachment; filename=\"user-cert.cer\"")
                    .contentType(MediaType.valueOf("application/pkix-cert"))
                    .body(certBytes);
        } catch (Exception e) {
            log.error("Failed to download user certificate", e);
            return ResponseEntity.internalServerError().build();
        }
    }

    // DTO for certificate info response
    public record CertificateInfoResponse(
            boolean exists,
            String type,
            String subject,
            String issuer,
            String validFrom,
            String validTo,
            String createdAt,
            String updatedAt) {}
}
