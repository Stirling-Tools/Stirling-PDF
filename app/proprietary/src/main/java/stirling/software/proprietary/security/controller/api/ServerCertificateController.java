package stirling.software.proprietary.security.controller.api;

import org.jboss.resteasy.reactive.RestForm;
import org.jboss.resteasy.reactive.multipart.FileUpload;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;

import jakarta.annotation.security.RolesAllowed;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.annotations.api.AdminServerCertificateApi;
import stirling.software.common.model.MultipartFile;
import stirling.software.common.model.multipart.FileUploadMultipartFile;
import stirling.software.common.service.ServerCertificateServiceInterface;

@AdminServerCertificateApi
@Path("/api/v1/admin/server-certificate")
@ApplicationScoped
@Slf4j
@RequiredArgsConstructor
@RolesAllowed("ADMIN")
public class ServerCertificateController {

    private final ServerCertificateServiceInterface serverCertificateService;

    @GET
    @Path("/info")
    @Operation(
            summary = "Get server certificate information",
            description = "Returns information about the current server certificate")
    public Response getServerCertificateInfo() {
        try {
            ServerCertificateServiceInterface.ServerCertificateInfo info =
                    serverCertificateService.getServerCertificateInfo();
            return Response.ok(info).build();
        } catch (Exception e) {
            log.error("Failed to get server certificate info", e);
            return Response.serverError().build();
        }
    }

    @POST
    @Path("/upload")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @Operation(
            summary = "Upload server certificate",
            description =
                    "Upload a new PKCS12 certificate file to be used as the server certificate")
    public Response uploadServerCertificate(
            @Parameter(description = "PKCS12 certificate file", required = true) @RestForm("file")
                    FileUpload fileUpload,
            @Parameter(description = "Certificate password", required = true) @RestForm("password")
                    String password) {

        MultipartFile file = FileUploadMultipartFile.of(fileUpload);

        if (file == null || file.isEmpty()) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity("Certificate file cannot be empty")
                    .build();
        }

        if (!file.getOriginalFilename().toLowerCase().endsWith(".p12")
                && !file.getOriginalFilename().toLowerCase().endsWith(".pfx")) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity("Only PKCS12 (.p12 or .pfx) files are supported")
                    .build();
        }

        try {
            serverCertificateService.uploadServerCertificate(file.getInputStream(), password);
            return Response.ok("Server certificate uploaded successfully").build();
        } catch (IllegalArgumentException e) {
            log.warn("Invalid certificate upload: {}", e.getMessage());
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity("Invalid certificate or password.")
                    .build();
        } catch (Exception e) {
            log.error("Failed to upload server certificate", e);
            return Response.serverError().entity("Failed to upload server certificate").build();
        }
    }

    @DELETE
    @Operation(
            summary = "Delete server certificate",
            description = "Delete the current server certificate")
    public Response deleteServerCertificate() {
        try {
            serverCertificateService.deleteServerCertificate();
            return Response.ok("Server certificate deleted successfully").build();
        } catch (Exception e) {
            log.error("Failed to delete server certificate", e);
            return Response.serverError().entity("Failed to delete server certificate").build();
        }
    }

    @POST
    @Path("/generate")
    @Operation(
            summary = "Generate new server certificate",
            description = "Generate a new self-signed server certificate")
    public Response generateServerCertificate() {
        try {
            serverCertificateService.deleteServerCertificate(); // Remove existing if any
            serverCertificateService.initializeServerCertificate(); // Generate new
            return Response.ok("New server certificate generated successfully").build();
        } catch (Exception e) {
            log.error("Failed to generate server certificate", e);
            return Response.serverError().entity("Failed to generate server certificate").build();
        }
    }

    @GET
    @Path("/certificate")
    @Operation(
            summary = "Download server certificate",
            description = "Download the server certificate in DER format for validation purposes")
    public Response getServerCertificate() {
        try {
            if (!serverCertificateService.hasServerCertificate()) {
                return Response.status(Response.Status.NOT_FOUND).build();
            }

            byte[] certificate = serverCertificateService.getServerCertificatePublicKey();

            return Response.ok(certificate, MediaType.valueOf("application/pkix-cert"))
                    .header(
                            HttpHeaders.CONTENT_DISPOSITION,
                            "attachment; filename=\"server-cert.cer\"")
                    .build();
        } catch (Exception e) {
            log.error("Failed to get server certificate", e);
            return Response.serverError().build();
        }
    }

    @GET
    @Path("/enabled")
    @Operation(
            summary = "Check if server certificate feature is enabled",
            description =
                    "Returns whether the server certificate feature is enabled in configuration")
    public Response isServerCertificateEnabled() {
        return Response.ok(serverCertificateService.isEnabled()).build();
    }
}
