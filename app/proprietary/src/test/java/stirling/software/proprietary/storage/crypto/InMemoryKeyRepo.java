package stirling.software.proprietary.storage.crypto;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.Comparator;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import stirling.software.proprietary.storage.model.FileEncryptionKey;
import stirling.software.proprietary.storage.repository.FileEncryptionKeyRepository;

/** Map-backed Mockito stub of the key repository for crypto tests (no JPA slice needed). */
public final class InMemoryKeyRepo {

    public final Map<UUID, FileEncryptionKey> rows = new ConcurrentHashMap<>();
    public final FileEncryptionKeyRepository mock;

    public InMemoryKeyRepo() {
        mock = mock(FileEncryptionKeyRepository.class);
        when(mock.saveAndFlush(any(FileEncryptionKey.class)))
                .thenAnswer(
                        inv -> {
                            FileEncryptionKey row = inv.getArgument(0);
                            rows.put(row.getKeyId(), row);
                            return row;
                        });
        when(mock.save(any(FileEncryptionKey.class)))
                .thenAnswer(
                        inv -> {
                            FileEncryptionKey row = inv.getArgument(0);
                            rows.put(row.getKeyId(), row);
                            return row;
                        });
        // findByIdOptional, not findById: Panache's inherited findById returns a nullable entity,
        // so the service uses the Optional-returning variant.
        when(mock.findByIdOptional(any(UUID.class)))
                .thenAnswer(inv -> Optional.ofNullable(rows.get(inv.<UUID>getArgument(0))));
        when(mock.findFirstByScopeTypeAndScopeIdAndStatus(any(), anyLong(), any()))
                .thenAnswer(
                        inv ->
                                rows.values().stream()
                                        .filter(r -> r.getScopeType() == inv.getArgument(0))
                                        .filter(r -> r.getScopeId() == inv.<Long>getArgument(1))
                                        .filter(r -> r.getStatus() == inv.getArgument(2))
                                        .findFirst());
        when(mock.findFirstByScopeTypeAndScopeIdOrderByKeyVersionDesc(any(), anyLong()))
                .thenAnswer(
                        inv ->
                                rows.values().stream()
                                        .filter(r -> r.getScopeType() == inv.getArgument(0))
                                        .filter(r -> r.getScopeId() == inv.<Long>getArgument(1))
                                        .max(
                                                Comparator.comparingInt(
                                                        FileEncryptionKey::getKeyVersion)));
        when(mock.findFirstByStatus(any()))
                .thenAnswer(
                        inv ->
                                rows.values().stream()
                                        .filter(r -> r.getStatus() == inv.getArgument(0))
                                        .findFirst());
        when(mock.count()).thenAnswer(inv -> (long) rows.size());
    }
}
