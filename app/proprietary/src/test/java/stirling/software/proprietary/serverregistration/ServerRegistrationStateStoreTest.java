package stirling.software.proprietary.serverregistration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.Test;

class ServerRegistrationStateStoreTest {
    @Test
    void restartAndProofRenewalRetainBootstrapSecretAndMonotonicSequence() {
        var repository = mock(ServerRegistrationStateRepository.class);
        AtomicReference<ServerRegistrationState> saved = new AtomicReference<>();
        when(repository.findById(1L)).thenAnswer(call -> Optional.ofNullable(saved.get()));
        when(repository.saveAndFlush(any()))
                .thenAnswer(
                        call -> {
                            var state = call.getArgument(0, ServerRegistrationState.class);
                            saved.set(state);
                            return state;
                        });
        var first = new ServerRegistrationStateStore(repository).reserve("old-proof");
        String secret = first.getRegistrationSecret();
        UUID installation = first.getInstallationId();
        assertThat(secret).hasSize(43);
        assertThat(first.getReportSequence()).isEqualTo(1);
        var restarted = new ServerRegistrationStateStore(repository);
        var second = restarted.reserve("old-proof");
        assertThat(second.getReportSequence()).isEqualTo(2);
        UUID registration = UUID.randomUUID();
        restarted.acknowledge(
                second,
                new ServerRegistrationProtocol.Receipt(
                        registration, 2, ServerRegistrationProtocol.PurchaseMapping.RESOLVED));
        var replacement = restarted.reserve("renewed-proof");
        assertThat(replacement.getRegistrationId()).isNull();
        assertThat(replacement.getInstallationId()).isEqualTo(installation);
        assertThat(replacement.getRegistrationSecret()).isEqualTo(secret);
        assertThat(replacement.getReportSequence()).isEqualTo(3);
    }

    @Test
    void receiptCannotReplaceAnExistingRegistrationId() {
        var repository = mock(ServerRegistrationStateRepository.class);
        var state = new ServerRegistrationState();
        state.setProofHash("proof");
        state.setReportSequence(3);
        state.setRegistrationId(UUID.randomUUID());
        when(repository.findById(1L)).thenReturn(Optional.of(state));
        new ServerRegistrationStateStore(repository)
                .acknowledge(
                        state,
                        new ServerRegistrationProtocol.Receipt(
                                UUID.randomUUID(),
                                3,
                                ServerRegistrationProtocol.PurchaseMapping.RESOLVED));
        verify(repository, never()).saveAndFlush(any());
    }

    @Test
    void staleAcknowledgementDoesNotBindReplacementLicense() {
        var repository = mock(ServerRegistrationStateRepository.class);
        var current = new ServerRegistrationState();
        current.setProofHash("new");
        current.setReportSequence(3);
        when(repository.findById(1L)).thenReturn(Optional.of(current));
        var old = new ServerRegistrationState();
        old.setProofHash("old");
        old.setReportSequence(2);
        new ServerRegistrationStateStore(repository)
                .acknowledge(
                        old,
                        new ServerRegistrationProtocol.Receipt(
                                UUID.randomUUID(),
                                2,
                                ServerRegistrationProtocol.PurchaseMapping.RESOLVED));
        verify(repository, never()).saveAndFlush(any());
    }
}
