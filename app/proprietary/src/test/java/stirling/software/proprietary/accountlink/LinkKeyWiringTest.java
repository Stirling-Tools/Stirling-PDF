package stirling.software.proprietary.accountlink;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.transaction.PlatformTransactionManager;

import stirling.software.common.cluster.DistributedLock;
import stirling.software.proprietary.service.OrgOwnerService;

/** Unit tests build these beans by hand, so only a context proves Spring can construct them. */
class LinkKeyWiringTest {

    @Test
    void theKeyBeansWireFromTheirDependencies() {
        new ApplicationContextRunner()
                .withBean(AccountLinkProperties.class)
                .withBean(AccountLinkClient.class, () -> mock(AccountLinkClient.class))
                .withBean(DeviceCredentialStore.class, () -> mock(DeviceCredentialStore.class))
                .withBean(EntitlementCache.class, () -> mock(EntitlementCache.class))
                .withBean(OrgOwnerService.class, () -> mock(OrgOwnerService.class))
                .withBean(DistributedLock.class, () -> mock(DistributedLock.class))
                .withBean(
                        PlatformTransactionManager.class,
                        () -> mock(PlatformTransactionManager.class))
                .withBean(AccountLinkService.class, () -> mock(AccountLinkService.class))
                .withBean(LocalUsageService.class, () -> mock(LocalUsageService.class))
                .withBean(LinkKeyRedeemService.class)
                .withBean(LinkKeyBootstrap.class)
                .withBean(AccountLinkKeyController.class)
                .run(
                        context -> {
                            assertThat(context).hasNotFailed();
                            assertThat(context).hasSingleBean(LinkKeyBootstrap.class);
                            assertThat(context).hasSingleBean(AccountLinkKeyController.class);
                        });
    }
}
