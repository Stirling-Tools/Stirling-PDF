package stirling.software.proprietary.security.controller.api;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.service.ServerCertificateServiceInterface;

@RestController
@RequestMapping("/api/v1/admin/server-certificate")
@Slf4j
@Tag(
        name = "Admin - Server Certificate",
        description = "Admin APIs for server certificate management")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class ServerCertificateController {

    private final ServerCertificateServiceInterface serverCertificateService;

    @GetMapping("/info")
    @Operation(
            summary = "Get server certificate information",
            description = "Returns information about the current server certificate")
    public ResponseEntity<ServerCertificateServiceInterface.ServerCertificateInfo>
            getServerCertificateInfo() {
        try {
            ServerCertificateServiceInterface.ServerCertificateInfo info =
                    serverCertificateService.getServerCertificateInfo();
            return ResponseEntity.ok(info);
        } catch (Exception e) {
            log.error("Failed to get server certificate info", e);
            return ResponseEntity.internalServerError().build();
        }
    }

    @PostMapping("/upload")
    @Operation(
            summary = "Upload server certificate",
            description =
                    "Upload a new PKCS12 certificate file to be used as the server certificate")
    public ResponseEntity<String> uploadServerCertificate(
            @Parameter(description = "PKCS12 certificate file", required = true)
                    @RequestParam("file")
                    MultipartFile file,
            @Parameter(description = "Certificate password", required = true)
                    @RequestParam("password")
                    String password) {

        if (file.isEmpty()) {
            return ResponseEntity.badRequest().body("Certificate file cannot be empty");
        }

        if (!file.getOriginalFilename().toLowerCase().endsWith(".p12")
                && !file.getOriginalFilename().toLowerCase().endsWith(".pfx")) {
            return ResponseEntity.badRequest()
                    .body("Only PKCS12 (.p12 or .pfx) files are supported");
        }

        try {
            serverCertificateService.uploadServerCertificate(file.getInputStream(), password);
            return ResponseEntity.ok("Server certificate uploaded successfully");
        } catch (IllegalArgumentException e) {
            log.warn("Invalid certificate upload: {}", e.getMessage());
            return ResponseEntity.badRequest().body("Invalid certificate or password.");
        } catch (Exception e) {
            log.error("Failed to upload server certificate", e);
            return ResponseEntity.internalServerError().body("Failed to upload server certificate");
        }
    }

    @DeleteMapping
    @Operation(
            summary = "Delete server certificate",
            description = "Delete the current server certificate")
    public ResponseEntity<String> deleteServerCertificate() {
        try {
            serverCertificateService.deleteServerCertificate();
            return ResponseEntity.ok("Server certificate deleted successfully");
        } catch (Exception e) {
            log.error("Failed to delete server certificate", e);
            return ResponseEntity.internalServerError().body("Failed to delete server certificate");
        }
    }

    @PostMapping("/generate")
    @Operation(
            summary = "Generate new server certificate",
            description = "Generate a new self-signed server certificate")
    public ResponseEntity<String> generateServerCertificate() {
        try {
            serverCertificateService.deleteServerCertificate(); // Remove existing if any
            serverCertificateService.initializeServerCertificate(); // Generate new
            return ResponseEntity.ok("New server certificate generated successfully");
        } catch (Exception e) {
            log.error("Failed to generate server certificate", e);
            return ResponseEntity.internalServerError()
                    .body("Failed to generate server certificate");
        }
    }

    @GetMapping("/certificate")
    @Operation(
            summary = "Download server certificate",
            description = "Download the server certificate in DER format for validation purposes")
    public ResponseEntity<byte[]> getServerCertificate() {
        try {
            if (!serverCertificateService.hasServerCertificate()) {
                return ResponseEntity.notFound().build();
            }

            byte[] certificate = serverCertificateService.getServerCertificatePublicKey();

            return ResponseEntity.ok()
                    .header(
                            HttpHeaders.CONTENT_DISPOSITION,
                            "attachment; filename=\"server-cert.cer\"")
                    .contentType(MediaType.valueOf("application/pkix-cert"))
                    .body(certificate);
        } catch (Exception e) {
            log.error("Failed to get server certificate", e);
            return ResponseEntity.internalServerError().build();
        }
    }

    @GetMapping("/enabled")
    @Operation(
            summary = "Check if server certificate feature is enabled",
            description =
                    "Returns whether the server certificate feature is enabled in configuration")
    public ResponseEntity<Boolean> isServerCertificateEnabled() {
        return ResponseEntity.ok(serverCertificateService.isEnabled());
    }
}
