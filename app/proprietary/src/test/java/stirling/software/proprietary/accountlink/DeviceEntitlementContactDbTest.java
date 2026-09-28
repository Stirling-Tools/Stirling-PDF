package stirling.software.proprietary.accountlink;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.time.LocalDateTime;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.AutoConfigurationPackage;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;

@DataJpaTest
class DeviceEntitlementContactDbTest {
    @Autowired DeviceCredentialRepository repository;

    @Test
    void successfulContactIsDurableAndOlderOrWrongDeviceResponsesCannotExtendIt() {
        var device = new DeviceCredential();
        device.setDeviceId("current");
        device.setDeviceSecret("secret");
        device.setLinkedAt(LocalDateTime.of(2026, 9, 15, 0, 0));
        repository.saveAndFlush(device);
        Instant contact = Instant.parse("2026-09-15T10:00:00Z");
        assertThat(repository.recordEntitlementContact("current", contact, true, null))
                .isEqualTo(1);
        var restored = repository.findCredential().orElseThrow();
        assertThat(restored.getLastEntitlementSuccessAt()).isEqualTo(contact);
        assertThat(restored.isEntitlementRevoked()).isTrue();
        assertThat(restored.getFleetUserLimit()).isNull();
        assertThat(
                        repository.recordEntitlementContact(
                                "old-device", contact.plusSeconds(20), false, 17))
                .isZero();
        assertThat(
                        repository.recordEntitlementContact(
                                "current", contact.minusSeconds(1), false, 17))
                .isZero();
        assertThat(repository.findCredential().orElseThrow().isEntitlementRevoked()).isTrue();
        assertThat(
                        repository.recordEntitlementContact(
                                "current", contact.plusSeconds(1), false, 17))
                .isEqualTo(1);
        assertThat(repository.findCredential().orElseThrow().isEntitlementRevoked()).isFalse();
        assertThat(repository.findCredential().orElseThrow().getFleetUserLimit()).isEqualTo(17);
    }

    @SpringBootConfiguration
    @AutoConfigurationPackage
    static class TestApp {}
}
