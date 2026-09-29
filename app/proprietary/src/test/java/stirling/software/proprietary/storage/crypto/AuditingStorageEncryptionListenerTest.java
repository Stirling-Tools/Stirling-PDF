package stirling.software.proprietary.storage.crypto;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import stirling.software.proprietary.audit.AuditEventType;
import stirling.software.proprietary.service.AuditService;

/**
 * Covers the one knob a compliance reviewer actually turns: {@code storage.encryption.auditReads}
 * must silence per-read decrypt events without silencing denials or key lifecycle events.
 */
class AuditingStorageEncryptionListenerTest {

    private static final UUID KEY_ID = UUID.fromString("11111111-2222-3333-4444-555555555555");

    private final AuditService auditService = mock(AuditService.class);

    private List<Map<String, Object>> auditedEvents() {
        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Object>> data = ArgumentCaptor.forClass(Map.class);
        verify(auditService, atLeastOnce())
                .audit(eq(AuditEventType.STORAGE_ENCRYPTION), data.capture());
        return data.getAllValues();
    }

    @Test
    void auditReadsOn_recordsDecryptWithKeyAndStorageKey() {
        new AuditingStorageEncryptionListener(auditService, true).decrypted("team/blob", KEY_ID);

        assertThat(auditedEvents())
                .singleElement()
                .satisfies(
                        event -> {
                            assertThat(event).containsEntry("action", "decrypt");
                            assertThat(event).containsEntry("storageKey", "team/blob");
                            assertThat(event).containsEntry("keyId", KEY_ID.toString());
                        });
    }

    @Test
    void auditReadsOff_dropsDecryptButKeepsEverythingElse() {
        AuditingStorageEncryptionListener listener =
                new AuditingStorageEncryptionListener(auditService, false);

        listener.decrypted("team/blob", KEY_ID);
        verify(auditService, never()).audit(eq(AuditEventType.STORAGE_ENCRYPTION), anyMap());

        listener.encrypted("team/blob", KEY_ID);
        listener.decryptDenied(KEY_ID, "key disabled");
        listener.keyCreated(KEY_ID, "TEAM:7", 2);

        // Denials and lifecycle events are the compliance-relevant ones; they are never optional.
        assertThat(auditedEvents())
                .extracting(event -> event.get("action"))
                .containsExactly("encrypt", "decrypt.denied", "key.created");
    }

    @Test
    void decryptDenied_carriesTheReason() {
        new AuditingStorageEncryptionListener(auditService, false)
                .decryptDenied(KEY_ID, "key not found");

        assertThat(auditedEvents())
                .singleElement()
                .satisfies(
                        event -> {
                            assertThat(event).containsEntry("action", "decrypt.denied");
                            assertThat(event).containsEntry("reason", "key not found");
                            assertThat(event).containsEntry("keyId", KEY_ID.toString());
                        });
    }

    @Test
    void keyCreated_carriesScopeAndVersion() {
        new AuditingStorageEncryptionListener(auditService, true).keyCreated(KEY_ID, "TEAM:7", 2);

        assertThat(auditedEvents())
                .singleElement()
                .satisfies(
                        event -> {
                            assertThat(event).containsEntry("action", "key.created");
                            assertThat(event).containsEntry("scope", "TEAM:7");
                            assertThat(event).containsEntry("keyVersion", 2);
                        });
    }
}
