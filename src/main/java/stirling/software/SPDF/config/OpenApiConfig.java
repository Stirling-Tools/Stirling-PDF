package stirling.software.SPDF.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.model.ApplicationProperties;

@Configuration
@RequiredArgsConstructor
public class OpenApiConfig {

    private final ApplicationProperties applicationProperties;

    private static final String DEFAULT_TITLE = "Stirling PDF API";
    private static final String DEFAULT_DESCRIPTION =
            "API documentation for all Server-Side processing.\n"
                    + "Please note some functionality might be UI only and missing from here.";

    @Bean
    public OpenAPI customOpenAPI() {
        String version = getClass().getPackage().getImplementationVersion();
        if (version == null) {
            // default version if all else fails
            version = "1.0.0";
        }
        if (!applicationProperties.getSecurity().getEnableLogin()) {
            return new OpenAPI()
                    .components(new Components())
                    .info(
                            new Info()
                                    .title(DEFAULT_TITLE)
                                    .version(version)
                                    .description(DEFAULT_DESCRIPTION));
        } else {
            SecurityScheme apiKeyScheme =
                    new SecurityScheme()
                            .type(SecurityScheme.Type.APIKEY)
                            .in(SecurityScheme.In.HEADER)
                            .name("X-API-KEY");
            return new OpenAPI()
                    .components(new Components().addSecuritySchemes("apiKey", apiKeyScheme))
                    .info(
                            new Info()
                                    .title(DEFAULT_TITLE)
                                    .version(version)
                                    .description(DEFAULT_DESCRIPTION))
                    .addSecurityItem(new SecurityRequirement().addList("apiKey"));
        }
    }
}
