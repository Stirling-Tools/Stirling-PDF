package stirling.software.proprietary.policy.s3;

import static org.mockito.Mockito.mock;

import stirling.software.proprietary.access.service.OwnershipService;
import stirling.software.proprietary.integration.repository.IntegrationConfigRepository;
import stirling.software.proprietary.security.service.UserService;

/** Test fixtures for S3 connection plumbing shared across the policy S3 tests. */
public final class S3TestConnections {

    private S3TestConnections() {}

    /**
     * A resolver for tests whose options embed credentials directly (the legacy pass-through path),
     * so its collaborators are never touched.
     */
    public static S3ConnectionResolver legacyResolver() {
        return new S3ConnectionResolver(
                mock(IntegrationConfigRepository.class),
                mock(OwnershipService.class),
                mock(UserService.class));
    }
}
