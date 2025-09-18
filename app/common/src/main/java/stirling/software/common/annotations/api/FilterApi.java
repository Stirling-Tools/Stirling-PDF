package stirling.software.common.annotations.api;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.tags.Tag;

/**
 * Combined annotation for Filter API controllers.
 * Includes @RestController, @RequestMapping("/api/v1/filter"), and OpenAPI @Tag.
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@RestController
@RequestMapping("/api/v1/filter")
@Tag(
        name = "Filter",
        description =
                """
                Document content filtering and search operations for information discovery and organization.

                This endpoint group enables intelligent content discovery and organization within
                document collections for content-based processing and information extraction.

                Common use cases:
                • Legal discovery, research organization, and compliance auditing
                • Content moderation, academic research, and business intelligence
                • Quality assurance and content validation workflows

                Business applications:
                • Contract analysis, financial review, and healthcare records organization
                • Government processing, educational curation, and IP protection

                Workflow scenarios:
                • Large-scale processing, automated classification, and information extraction
                • Document preparation for further processing or analysis

                Target users: Legal professionals, researchers, compliance officers, and
                organizations requiring intelligent document content discovery and organization.
                """)
public @interface FilterApi {}
