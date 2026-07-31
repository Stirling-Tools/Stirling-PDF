package stirling.software.SPDF.controller.api.security;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.security.Pkcs11CertificatesRequest;
import stirling.software.SPDF.service.HardwareKeyStoreService;

/**
 * Lets the desktop frontend discover which hardware-backed signing options the local backend can
 * reach (Windows certificate store, plugged-in USB / PKCS#11 tokens) and enumerate the certificates
 * available to sign with. Enumeration endpoints are restricted to the desktop bundle, reached over
 * loopback - see {@link HardwareKeyStoreService#assertLocalDesktop}.
 */
@Path("/api/v1/security/cert-sign/hardware")
@ApplicationScoped
@Produces(MediaType.APPLICATION_JSON)
@RequiredArgsConstructor
@Slf4j
@Tag(name = "Security", description = "Security APIs")
public class HardwareSigningController {

    private final HardwareKeyStoreService hardwareKeyStoreService;

    @GET
    @Path("/capabilities")
    @Operation(
            summary = "Hardware signing capabilities",
            description =
                    "Reports whether hardware-backed signing is available on this device and which"
                            + " PKCS#11 driver libraries were detected. Returns desktop=false when"
                            + " not running as the desktop app.")
    public Response getCapabilities() {
        return Response.ok(hardwareKeyStoreService.capabilities()).build();
    }

    @GET
    @Path("/windows-certificates")
    @Operation(
            summary = "List Windows certificate store signing certificates",
            description =
                    "Enumerates certificates with a usable private key from the current user's"
                            + " Windows certificate store. Desktop-only, loopback-only.")
    public Response getWindowsCertificates(@Context HttpServletRequest request) throws Exception {
        hardwareKeyStoreService.assertLocalDesktop(request);
        return Response.ok(hardwareKeyStoreService.listWindowsCertificates()).build();
    }

    @POST
    @Path("/pkcs11-certificates")
    @Consumes(MediaType.APPLICATION_JSON)
    @Operation(
            summary = "List PKCS#11 token signing certificates",
            description =
                    "Logs into a PKCS#11 token with the supplied PIN and enumerates its signing"
                            + " certificates. The PIN is used only for this call. Desktop-only,"
                            + " loopback-only.")
    public Response getPkcs11Certificates(
            @Context HttpServletRequest request, Pkcs11CertificatesRequest body) throws Exception {
        hardwareKeyStoreService.assertLocalDesktop(request);
        char[] pin = body.pin() != null ? body.pin().toCharArray() : null;
        try {
            return Response.ok(
                            hardwareKeyStoreService.listPkcs11Certificates(
                                    body.libraryPath(), body.slot(), pin))
                    .build();
        } finally {
            if (pin != null) {
                java.util.Arrays.fill(pin, '\0');
            }
        }
    }
}
