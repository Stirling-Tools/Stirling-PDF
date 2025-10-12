package stirling.software.common.annotations.api;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.tags.Tag;

/**
 * Combined annotation for Pipeline API controllers.
 * Includes @RestController, @RequestMapping("/api/v1/pipeline"), and OpenAPI @Tag.
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@RestController
@RequestMapping("/api/v1/pipeline")
@Tag(
        name = "Pipeline",
        description =
                """
                Automated document processing workflows for complex multi-stage business operations.

                This endpoint group enables organizations to create sophisticated document processing
                workflows that combine multiple operations into streamlined, repeatable processes.

                Common use cases:
                • Invoice processing, legal document review, and healthcare records standardization
                • Government processing, educational content preparation, and publishing automation
                • Contract lifecycle management and approval processes

                Business applications:
                • Automated compliance reporting, large-scale migration, and quality assurance
                • Archive preparation, content delivery, and document approval workflows

                Operational scenarios:
                • Scheduled batch processing and event-driven document processing
                • Multi-department coordination and business system integration

                Target users: Business process managers, IT automation specialists, and organizations
                requiring consistent, repeatable document processing workflows.
                """)
public @interface PipelineApi {}
