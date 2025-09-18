package stirling.software.common.annotations.api;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.tags.Tag;

/**
 * Combined annotation for Convert API controllers.
 * Includes @RestController, @RequestMapping("/api/v1/convert"), and OpenAPI @Tag.
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@RestController
@RequestMapping("/api/v1/convert")
@Tag(
        name = "Convert",
        description =
                """
                Document format transformation services for cross-platform compatibility and workflow integration.

                This endpoint group enables transformation between various formats, supporting
                diverse business workflows and system integrations for mixed document ecosystems.

                Common use cases:
                • Legacy system integration, document migration, and cross-platform sharing
                • Archive standardization, publishing preparation, and content adaptation
                • Accessibility compliance and mobile-friendly document preparation

                Business applications:
                • Enterprise content management, digital publishing, and educational platforms
                • Legal document processing, healthcare interoperability, and government standardization

                Integration scenarios:
                • API-driven pipelines, automated workflow preparation, and batch conversions
                • Real-time format adaptation for user requests

                Target users: System integrators, content managers, digital archivists, and
                organizations requiring flexible document format interoperability.
                """)
public @interface ConvertApi {}
