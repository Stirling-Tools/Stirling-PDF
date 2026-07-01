package stirling.software.SPDF.controller.api.security;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.servlet.http.HttpServletRequest;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.security.HardwareCertificateInfo;
import stirling.software.SPDF.model.api.security.HardwareSigningCapabilities;
import stirling.software.SPDF.model.api.security.Pkcs11CertificatesRequest;
import stirling.software.SPDF.service.HardwareKeyStoreService;

/**
 * Lets the desktop frontend discover which hardware-backed signing options the local backend can
 * reach (Windows certificate store, plugged-in USB / PKCS#11 tokens) and enumerate the certificates
 * available to sign with. Enumeration endpoints are restricted to the desktop bundle, reached over
 * loopback - see {@link HardwareKeyStoreService#assertLocalDesktop}.
 */
@RestController
@RequestMapping("/api/v1/security/cert-sign/hardware")
@RequiredArgsConstructor
@Slf4j
@Tag(name = "Security", description = "Security APIs")
public class HardwareSigningController {

    private final HardwareKeyStoreService hardwareKeyStoreService;

    @GetMapping("/capabilities")
    @Operation(
            summary = "Hardware signing capabilities",
            description =
                    "Reports whether hardware-backed signing is available on this device and which"
                            + " PKCS#11 driver libraries were detected. Returns desktop=false when"
                            + " not running as the desktop app.")
    public ResponseEntity<HardwareSigningCapabilities> getCapabilities() {
        return ResponseEntity.ok(hardwareKeyStoreService.capabilities());
    }

    @GetMapping("/windows-certificates")
    @Operation(
            summary = "List Windows certificate store signing certificates",
            description =
                    "Enumerates certificates with a usable private key from the current user's"
                            + " Windows certificate store. Desktop-only, loopback-only.")
    public ResponseEntity<List<HardwareCertificateInfo>> getWindowsCertificates(
            HttpServletRequest request) throws Exception {
        hardwareKeyStoreService.assertLocalDesktop(request);
        return ResponseEntity.ok(hardwareKeyStoreService.listWindowsCertificates());
    }

    @PostMapping("/pkcs11-certificates")
    @Operation(
            summary = "List PKCS#11 token signing certificates",
            description =
                    "Logs into a PKCS#11 token with the supplied PIN and enumerates its signing"
                            + " certificates. The PIN is used only for this call. Desktop-only,"
                            + " loopback-only.")
    public ResponseEntity<List<HardwareCertificateInfo>> getPkcs11Certificates(
            HttpServletRequest request, @RequestBody Pkcs11CertificatesRequest body)
            throws Exception {
        hardwareKeyStoreService.assertLocalDesktop(request);
        char[] pin = body.pin() != null ? body.pin().toCharArray() : null;
        try {
            return ResponseEntity.ok(
                    hardwareKeyStoreService.listPkcs11Certificates(
                            body.libraryPath(), body.slot(), pin));
        } finally {
            if (pin != null) {
                java.util.Arrays.fill(pin, '\0');
            }
        }
    }
}
