package stirling.software.SPDF.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.info.License;
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
        Info info =
                new Info()
                        .title(DEFAULT_TITLE)
                        .version(version)
                        .license(
                                new License()
                                        .name("MIT")
                                        .url(
                                                "https://raw.githubusercontent.com/Stirling-Tools/Stirling-PDF/refs/heads/main/LICENSE")
                                        .identifier("MIT"))
                        .termsOfService("https://www.stirlingpdf.com/terms")
                        .contact(
                                new Contact()
                                        .name("Stirling Software")
                                        .url("https://www.stirlingpdf.com")
                                        .email("contact@stirlingpdf.com"))
                        .description(DEFAULT_DESCRIPTION);
        if (!applicationProperties.getSecurity().getEnableLogin()) {
            return new OpenAPI().components(new Components()).info(info);
        } else {
            SecurityScheme apiKeyScheme =
                    new SecurityScheme()
                            .type(SecurityScheme.Type.APIKEY)
                            .in(SecurityScheme.In.HEADER)
                            .name("X-API-KEY");
            return new OpenAPI()
                    .components(new Components().addSecuritySchemes("apiKey", apiKeyScheme))
                    .info(info)
                    .addSecurityItem(new SecurityRequirement().addList("apiKey"));
        }
    }
}
