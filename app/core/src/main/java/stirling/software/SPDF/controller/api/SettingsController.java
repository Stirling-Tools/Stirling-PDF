package stirling.software.SPDF.controller.api;

import java.io.IOException;
import java.util.Map;

import org.jboss.resteasy.reactive.RestForm;

import io.swagger.v3.oas.annotations.Hidden;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.SettingsApi;
import stirling.software.common.configuration.InstallationPathConfig;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.GeneralUtils;

@SettingsApi
@Path("/api/v1/settings")
@ApplicationScoped
@RequiredArgsConstructor
@Hidden
public class SettingsController {

    private final ApplicationProperties applicationProperties;
    private final EndpointConfiguration endpointConfiguration;

    @AutoJobPostMapping(
            value = "/update-enable-analytics",
            resourceWeight = ResourceWeight.SMALL_WEIGHT)
    @POST
    @Path("/update-enable-analytics")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @Hidden
    public Response updateApiKey(@RestForm("enabled") Boolean enabled) throws IOException {
        if (applicationProperties.getSystem().getEnableAnalytics() != null) {
            // HTTP 208 ALREADY_REPORTED is not in JAX-RS Response.Status enum; use numeric code
            return Response.status(208)
                    .entity(
                            Map.of(
                                    "message",
                                    "Setting has already been set, To adjust please edit "
                                            + InstallationPathConfig.getSettingsPath()))
                    .build();
        }
        GeneralUtils.saveKeyToSettings("system.enableAnalytics", enabled);
        applicationProperties.getSystem().setEnableAnalytics(enabled);
        return Response.ok(Map.of("message", "Updated")).build();
    }

    @GET
    @Path("/get-endpoints-status")
    @Hidden
    public Response getDisabledEndpoints() {
        return Response.ok(endpointConfiguration.getEndpointStatuses()).build();
    }
}
