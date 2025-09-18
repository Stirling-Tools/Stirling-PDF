package stirling.software.common.annotations.api;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.tags.Tag;

/**
 * Combined annotation for Analysis API controllers.
 * Includes @RestController, @RequestMapping("/api/v1/analysis"), and OpenAPI @Tag.
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@RestController
@RequestMapping("/api/v1/analysis")
@Tag(
        name = "Analysis",
        description =
                """
                Document analysis and information extraction services for content intelligence and insights.

                This endpoint group provides analytical capabilities to understand document structure,
                extract information, and generate insights from PDF content for automated processing.

                Common use cases:
                • Document inventory management and content audit for compliance verification
                • Quality assurance workflows and business intelligence analytics
                • Migration planning, accessibility evaluation, and document forensics

                Business applications:
                • Legal discovery, financial document review, and healthcare records analysis
                • Academic research, government processing, and publishing optimization

                Operational scenarios:
                • Large-scale profiling, migration assessment, and performance optimization
                • Automated quality control and content strategy development

                Target users: Data analysts, QA teams, administrators, and business intelligence
                professionals requiring detailed document insights.
                """)
public @interface AnalysisApi {}
