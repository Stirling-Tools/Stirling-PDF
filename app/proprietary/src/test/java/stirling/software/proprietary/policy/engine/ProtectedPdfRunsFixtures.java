package stirling.software.proprietary.policy.engine;

import static org.mockito.Mockito.mock;

import stirling.software.proprietary.connectedaccount.ConnectedAccountService;
import stirling.software.proprietary.integration.purview.protection.RightsManagementService;
import stirling.software.proprietary.security.database.repository.UserRepository;

public final class ProtectedPdfRunsFixtures {

    private ProtectedPdfRunsFixtures() {}

    public static ProtectedPdfRuns unused() {
        return new ProtectedPdfRuns(
                mock(RightsManagementService.class),
                mock(ConnectedAccountService.class),
                mock(UserRepository.class));
    }
}
