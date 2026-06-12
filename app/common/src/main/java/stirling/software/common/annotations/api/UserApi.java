package stirling.software.common.annotations.api;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;


import io.swagger.v3.oas.annotations.tags.Tag;

/**
 * Combined annotation for User Management API controllers.
 * Includes @RestController, @RequestMapping("/api/v1/user"), and OpenAPI @Tag.
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
// MIGRATION (Spring->JAX-RS): controllers using this annotation must declare @jakarta.ws.rs.Path("/api/v1/user").
// JAX-RS does not honour @Path via meta-annotations, so the path is not inherited from here.
@Tag(
        name = "User",
        description =
                """
                User management and authentication services for multi-user and enterprise environments.

                This endpoint group provides user lifecycle management capabilities for organizations
                deploying Stirling PDF in multi-user scenarios.

                Common use cases:
                • Employee onboarding/offboarding and corporate access control
                • Department-based permissions, regulatory compliance, and SSO integration
                • Multi-tenant deployment and guest user access management

                Business applications:
                • Enterprise IAM integration, security governance, and cost allocation
                • Compliance reporting, workflow management, and partner collaboration

                Operational scenarios:
                • Large-scale provisioning, automated HR integration, and emergency access
                • User migration and self-service profile maintenance

                Target users: IT administrators, HR departments, and organizations requiring
                structured user management and enterprise identity integration.
                """)
public @interface UserApi {}
