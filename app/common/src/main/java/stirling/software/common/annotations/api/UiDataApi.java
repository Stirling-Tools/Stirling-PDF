package stirling.software.common.annotations.api;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.tags.Tag;

/**
 * Combined annotation for UI Data API controllers.
 * Includes @RestController, @RequestMapping("/api/v1/ui-data"), and OpenAPI @Tag.
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@RestController
@RequestMapping("/api/v1/ui-data")
@Tag(
        name = "UI Data",
        description =
                """
                User interface data services for dynamic frontend applications and user experience customization.

                This endpoint group provides data services for frontend applications to render personalized
                interfaces and deliver optimized experiences based on system configuration.

                Common use cases:
                • Dynamic UI customization, multi-language support, and feature configuration
                • Real-time status delivery, corporate branding, and mobile optimization
                • Progressive web application (PWA) configuration

                Business applications:
                • Brand customization, user experience optimization, and accessibility compliance
                • Multi-tenant customization, training support, and performance optimization

                Operational scenarios:
                • Frontend deployment, UI A/B testing, and system integration
                • Mobile synchronization and offline capability enhancement

                Target users: Frontend developers, UI/UX designers, and organizations requiring
                customizable user interfaces and optimized user experiences.
                """)
public @interface UiDataApi {}
