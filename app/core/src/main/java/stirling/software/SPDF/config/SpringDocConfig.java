package stirling.software.SPDF.config;

import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springdoc.core.models.GroupedOpenApi;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class SpringDocConfig {

    @Bean
    public GroupedOpenApi pdfProcessingApi(
            @Qualifier("pdfFileOneOfCustomizer") OpenApiCustomizer pdfFileOneOfCustomizer) {
        return GroupedOpenApi.builder()
                .group("file-processing")
                .displayName("File Processing")
                .pathsToMatch("/api/v1/**")
                .pathsToExclude(
                        "/api/v1/admin/**",
                        "/api/v1/user/**",
                        "/api/v1/settings/**",
                        "/api/v1/team/**",
                        "/api/v1/auth/**",
                        "/api/v1/invite/**",
                        "/api/v1/audit/**",
                        "/api/v1/ui-data/**",
                        "/api/v1/proprietary/ui-data/**",
                        "/api/v1/info/**",
                        "/api/v1/general/job/**",
                        "/api/v1/general/files/**")
                .addOpenApiCustomizer(pdfFileOneOfCustomizer)
                .addOpenApiCustomizer(
                        openApi -> {
                            openApi.info(
                                    openApi.getInfo()
                                            .title("Stirling PDF - Processing API")
                                            .description(
                                                    "APIs for converting, editing, securing, and analysing PDF documents. Use these endpoints to automate common PDF tasks (like split, merge, convert, OCR) and plug them into your own apps and backend jobs."));
                        })
                .build();
    }

    @Bean
    public GroupedOpenApi adminApi() {
        return GroupedOpenApi.builder()
                .group("management")
                .displayName("Management")
                .pathsToMatch(
                        "/api/v1/admin/**",
                        "/api/v1/user/**",
                        "/api/v1/settings/**",
                        "/api/v1/team/**",
                        "/api/v1/auth/**",
                        "/api/v1/invite/**",
                        "/api/v1/audit/**")
                .addOpenApiCustomizer(
                        openApi -> {
                            openApi.info(
                                    openApi.getInfo()
                                            .title("Stirling PDF - Management API")
                                            .description(
                                                    "Endpoints for authentication, user management, invitations, audit logging, and system configuration."));
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
                                                    "System information, UI metadata, job status, and file management endpoints."));
                        })
                .build();
    }
}
