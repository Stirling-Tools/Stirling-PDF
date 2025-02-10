package stirling.software.SPDF.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;

import stirling.software.SPDF.model.ApplicationProperties;

@Configuration
public class OpenApiConfig {

    private final ApplicationProperties applicationProperties;

    public OpenApiConfig(ApplicationProperties applicationProperties) {
        this.applicationProperties = applicationProperties;
    }

    @Bean
    public OpenAPI customOpenAPI() {
        String version = getClass().getPackage().getImplementationVersion();
        if (version == null) {
            // default version if all else fails
            version = "1.0.0";
        }
        SecurityScheme apiKeyScheme =
                new SecurityScheme()
                        .type(SecurityScheme.Type.APIKEY)
                        .in(SecurityScheme.In.HEADER)
                        .name("X-API-KEY");
        if (!applicationProperties.getSecurity().getEnableLogin()) {
            return new OpenAPI()
                    .components(new Components())
                    .info(
                            new Info()
                                    .title("Stirling PDF API")
                                    .version(version)
                                    .description(
                                            "API documentation for all Server-Side processing.\nPlease note some functionality might be UI only and missing from here."));
        } else {
            return new OpenAPI()
                    .components(new Components().addSecuritySchemes("apiKey", apiKeyScheme))
                    .info(
                            new Info()
                                    .title("Stirling PDF API")
                                    .version(version)
                                    .description(
                                            "API documentation for all Server-Side processing.\nPlease note some functionality might be UI only and missing from here."))
                    .addSecurityItem(new SecurityRequirement().addList("apiKey"));
        }
    }
}
