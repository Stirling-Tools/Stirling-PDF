package stirling.software.SPDF.config;

import java.util.Optional;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.info.License;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;

import stirling.software.common.model.ApplicationProperties;

@Configuration
public class OpenApiConfig {

    private final ApplicationProperties applicationProperties;
    private final boolean runningProOrHigher;

    public OpenApiConfig(
            ApplicationProperties applicationProperties,
            @Qualifier("runningProOrHigher") boolean runningProOrHigher) {
        this.applicationProperties = applicationProperties;
        this.runningProOrHigher = runningProOrHigher;
    }

    private static final String DEFAULT_COMPANY = "Stirling Software";
    private static final String DEFAULT_DESCRIPTION =
            "API documentation for all Server-Side processing.\n"
                    + "Please note some functionality might be UI only and missing from here.";
    private static final String DEFAULT_EMAIL = "contact@stirlingpdf.com";
    private static final String DEFAULT_TERMS_OF_SERVICE = "https://www.stirlingpdf.com/terms";
    private static final String DEFAULT_TITLE = "Stirling PDF API";
    private static final String DEFAULT_WEBSITE = "https://www.stirlingpdf.com";
    private static final String DEFAULT_VERSION = "1.0.0";

    @Bean
    public OpenAPI customOpenAPI() {
        String version =
                Optional.ofNullable(applicationProperties.getAutomaticallyGenerated())
                        .map(ApplicationProperties.AutomaticallyGenerated::getAppVersion)
                        .filter(v -> !v.isBlank())
                        .orElseGet(
                                () -> {
                                    String v = getClass().getPackage().getImplementationVersion();
                                    return v != null ? v : DEFAULT_VERSION;
                                });
        String title = DEFAULT_TITLE;
        String description = DEFAULT_DESCRIPTION;
        String termsOfService = DEFAULT_TERMS_OF_SERVICE;
        String company = DEFAULT_COMPANY;
        String email = DEFAULT_EMAIL;
        String website = DEFAULT_WEBSITE;

        License license =
                new License()
                        .name("MIT License")
                        .url(
                                "https://raw.githubusercontent.com/Stirling-Tools/Stirling-PDF/refs/heads/main/LICENSE")
                        .identifier("MIT");

        if (runningProOrHigher) {
            ApplicationProperties.Ui ui = applicationProperties.getUi();
            ApplicationProperties.Legal legal = applicationProperties.getLegal();

            ApplicationProperties.ApiContact apiContact = legal.getApiContact();
            title = Optional.ofNullable(ui.getAppName()).orElse(title);
            description = Optional.ofNullable(ui.getHomeDescription()).orElse(description);
            termsOfService =
                    Optional.ofNullable(legal.getTermsAndConditions()).orElse(termsOfService);
            company = Optional.ofNullable(apiContact.getCompany()).orElse(company);
            website = Optional.ofNullable(apiContact.getWebsite()).orElse(website);
            email = Optional.ofNullable(apiContact.getEmail()).orElse(email);
        }
        Contact contact = new Contact().name(company).url(website).email(email);

        Info info =
                new Info()
                        .title(title)
                        .version(version)
                        .license(license)
                        .termsOfService(termsOfService)
                        .contact(contact)
                        .description(description);
        if (!applicationProperties.getSecurity().getEnableLogin()) {
            return new OpenAPI().components(new Components()).info(info);
        }
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
