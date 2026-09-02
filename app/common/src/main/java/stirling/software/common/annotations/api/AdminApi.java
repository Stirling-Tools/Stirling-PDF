package stirling.software.common.annotations.api;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import io.swagger.v3.oas.annotations.tags.Tag;

/**
 * Combined annotation for Admin Settings API controllers.
 *
 * <p>MIGRATION (Spring -> JAX-RS): JAX-RS/RESTEasy does NOT process {@code @Path} via custom
 * meta-annotations (Spring honoured composed {@code @RestController}/{@code @RequestMapping}
 * through {@code @AliasFor}; JAX-RS has no equivalent). This annotation therefore now carries only
 * the OpenAPI {@code @Tag}. Each controller annotated with {@code @AdminApi} MUST additionally
 * declare its own {@code @jakarta.ws.rs.Path("/api/v1/admin/settings")} (the path the removed
 * {@code @RequestMapping} used to supply).
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Tag(
        name = "Admin Settings",
        description =
                """
                System administration and configuration management for enterprise deployments.

                This endpoint group provides administrative control for organizations deploying
                Stirling PDF in production environments with multi-user scenarios.

                Common use cases:
                • Enterprise deployment configuration and multi-tenant environment management
                • Security policy enforcement, compliance monitoring, and capacity planning
                • Operational maintenance, troubleshooting, and enterprise infrastructure integration
                • Disaster recovery and business continuity preparation

                Business applications:
                • Corporate IT governance, policy enforcement, and compliance reporting
                • Cost optimization, SLA monitoring, and vendor management oversight
                • Risk management and security incident response

                Operational scenarios:
                • 24/7 production monitoring, scheduled maintenance, and system updates
                • Emergency response, change management, and performance optimization

                Target users: IT administrators, system engineers, and operations teams
                responsible for enterprise-grade document processing infrastructure.
                """)
public @interface AdminApi {}
