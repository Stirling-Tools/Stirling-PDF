package stirling.software.common.annotations.api;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.tags.Tag;

/**
 * Combined annotation for Proprietary UI Data API controllers.
 * Includes @RestController, @RequestMapping("/api/v1/proprietary/ui-data"), and OpenAPI @Tag. Note:
 * Controllers using this annotation should also add @EnterpriseEndpoint.
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@RestController
@RequestMapping("/api/v1/proprietary/ui-data")
@Tag(
        name = "Proprietary UI Data",
        description =
                """
                Enterprise user interface data services for commercial deployments and advanced business features.

                This endpoint group provides enhanced data services for commercial and enterprise features,
                supporting advanced business workflows and professional-grade functionality.

                Common use cases:
                • Enterprise-grade dashboards, multi-tenant deployment, and business intelligence
                • Organizational hierarchy management and commercial feature licensing
                • Professional support integration and advanced workflow automation

                Business applications:
                • ERP integration, CRM development, and executive reporting dashboards
                • Multi-subsidiary management, professional service delivery, and compliance interfaces

                Operational scenarios:
                • Large-scale deployment management and white-label solution development
                • Advanced system integration and commercial feature rollout

                Target users: Enterprise administrators, business analysts, and organizations utilizing
                commercial features and advanced business capabilities.
                """)
public @interface ProprietaryUiDataApi {}
