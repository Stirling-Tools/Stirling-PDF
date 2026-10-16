package stirling.software.proprietary.serverregistration;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.AutoConfigurationPackage;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@DataJpaTest(properties = "stirling.server-registration.enabled=true")
@Import(ServerRegistrationStateStore.class)
class ServerRegistrationStateStoreDbTest {
    @Autowired private ServerRegistrationStateStore store;
    @Autowired private ServerRegistrationStateRepository repository;
    @Autowired private PlatformTransactionManager transactionManager;

    @Test
    void failedOuterWorkCannotRollBackTheCredentialOrReservedSequence() {
        var caller = new TransactionTemplate(transactionManager);
        var first =
                caller.execute(
                        status -> {
                            var state = store.reserve("proof");
                            status.setRollbackOnly();
                            return state;
                        });
        var second = store.reserve("proof");
        assertThat(second.getInstallationId()).isEqualTo(first.getInstallationId());
        assertThat(second.getRegistrationSecret()).isEqualTo(first.getRegistrationSecret());
        assertThat(second.getReportSequence()).isEqualTo(first.getReportSequence() + 1);
        UUID registration = UUID.randomUUID();
        store.acknowledge(
                second,
                new ServerRegistrationProtocol.Receipt(
                        registration,
                        second.getReportSequence(),
                        ServerRegistrationProtocol.PurchaseMapping.RESOLVED));
        var restored = store.reserve("proof");
        assertThat(restored.getRegistrationId()).isEqualTo(registration);
        assertThat(restored.getLastSuccessAt()).isNotNull();
        assertThat(repository.count()).isEqualTo(1);
    }

    @SpringBootConfiguration
    @AutoConfigurationPackage(basePackages = "stirling.software.proprietary.serverregistration")
    static class TestApp {}
}
