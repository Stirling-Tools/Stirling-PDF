package stirling.software.common.annotations.api;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.tags.Tag;

/**
 * Combined annotation for Settings API controllers.
 * Includes @RestController, @RequestMapping("/api/v1/settings"), and OpenAPI @Tag.
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@RestController
@RequestMapping("/api/v1/settings")
@Tag(
        name = "Settings",
        description =
                """
                User preferences and application customization for personalized workflow optimization.

                This endpoint group provides preference management capabilities for users and
                organizations to customize their document processing experience.

                Common use cases:
                • Workflow optimization, accessibility compliance, and corporate branding
                • Multi-language support, user personalization, and business system integration
                • Organizational policy compliance

                Business applications:
                • Corporate branding, productivity optimization, and accessibility compliance
                • Change management facilitation and training efficiency improvement

                Operational scenarios:
                • User onboarding, department-specific customization, and system migration
                • Multi-tenant customization and project-based configuration adjustments

                Target users: End users, department managers, and organizations focused on optimizing
                user experience and workflow efficiency through personalization.
                """)
public @interface SettingsApi {}
