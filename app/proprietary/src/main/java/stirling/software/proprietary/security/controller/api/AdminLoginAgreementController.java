package stirling.software.proprietary.security.controller.api;

import java.io.IOException;
import java.util.Map;
import java.util.Set;

import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.annotation.security.RolesAllowed;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.service.LoginAgreementService;

/**
 * Admin editing of the per-language login agreement markdown files
 * (customFiles/disclaimer/&lt;locale&gt;.md). The enable/visibility flags are managed through the
 * normal admin settings endpoints; only the live-edited text is handled here.
 */
@ApplicationScoped
@Path("/api/v1/admin/login-agreement")
@RolesAllowed("ADMIN")
@RequiredArgsConstructor
@Tag(name = "Admin Settings", description = "Login agreement text management")
@Hidden
@Slf4j
public class AdminLoginAgreementController {

    private final LoginAgreementService loginAgreementService;

    @GET
    @Produces(MediaType.APPLICATION_JSON)
    @Operation(summary = "List locales that currently have login agreement text")
    public Set<String> listLocales() {
        return loginAgreementService.listLocalesWithContent();
    }

    @GET
    @Path("/{locale}")
    @Produces(MediaType.APPLICATION_JSON)
    @Operation(summary = "Read the login agreement markdown for a locale")
    public Response read(@PathParam("locale") String locale) {
        String content = loginAgreementService.readRawForLocale(locale);
        if (content == null) {
            return Response.status(Response.Status.BAD_REQUEST).build();
        }
        return Response.ok(Map.of("locale", locale, "content", content)).build();
    }

    @PUT
    @Path("/{locale}")
    @Consumes(MediaType.APPLICATION_JSON)
    @Operation(summary = "Write the login agreement markdown for a locale (blank clears it)")
    public Response write(@PathParam("locale") String locale, DisclaimerContentRequest request) {
        try {
            loginAgreementService.writeForLocale(
                    locale, request == null ? null : request.content());
            return Response.noContent().build();
        } catch (IllegalArgumentException e) {
            return Response.status(Response.Status.BAD_REQUEST).build();
        } catch (IOException e) {
            log.error("Failed writing login agreement for locale {}", locale, e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR).build();
        }
    }

    public record DisclaimerContentRequest(String content) {}
}
