package stirling.software.SPDF.config;

import org.springdoc.core.models.GroupedOpenApi;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class SpringDocConfig {

    @Bean
    public GroupedOpenApi pdfProcessingApi() {
        return GroupedOpenApi.builder()
                .group("file-processing")
                .displayName("File Processing")
                .pathsToMatch("/api/v1/**")
                .pathsToExclude(
                        "/api/v1/admin/**",
                        "/api/v1/user/**",
                        "/api/v1/settings/**",
                        "/api/v1/team/**",
                        "/api/v1/ui-data/**",
                        "/api/v1/proprietary/ui-data/**",
                        "/api/v1/info/**",
                        "/api/v1/general/job/**",
                        "/api/v1/general/files/**")
                .addOpenApiCustomizer(
                        openApi -> {
                            openApi.info(
                                    openApi.getInfo()
                                            .title("Stirling PDF - Processing API")
                                            .description(
                                                    "API documentation for PDF processing operations including conversion, manipulation, security, and utility functions."));
                        })
                .build();
    }

    @Bean
    public GroupedOpenApi adminApi() {
        return GroupedOpenApi.builder()
                .group("management")
                .displayName("Management")
                .pathsToMatch("/api/v1/admin/**", "/api/v1/user/**", "/api/v1/settings/**", "/api/v1/team/**")
                .addOpenApiCustomizer(
                        openApi -> {
                            openApi.info(
                                    openApi.getInfo()
                                            .title("Stirling PDF - Admin API")
                                            .description(
                                                    "API documentation for administrative functions, user management, settings, and system configuration."));
                        })
                .build();
    }

    @Bean
    public GroupedOpenApi systemApi() {
        return GroupedOpenApi.builder()
                .group("system")
                .displayName("System & UI API")
                .pathsToMatch(
                        "/api/v1/ui-data/**",
                        "/api/v1/proprietary/ui-data/**",
                        "/api/v1/info/**",
                        "/api/v1/general/job/**",
                        "/api/v1/general/files/**")
                .addOpenApiCustomizer(
                        openApi -> {
                            openApi.info(
                                    openApi.getInfo()
                                            .title("Stirling PDF - System API")
                                            .description(
                                                    "API documentation for system information, UI data, and general utility endpoints."));
                        })
                .build();
    }
}
