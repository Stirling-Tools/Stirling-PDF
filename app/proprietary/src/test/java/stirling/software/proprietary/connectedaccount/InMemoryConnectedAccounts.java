package stirling.software.proprietary.connectedaccount;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/** A {@link ConnectedAccountRepository} backed by a map, for tests without a database. */
public final class InMemoryConnectedAccounts {

    public final Map<Long, ConnectedAccount> rows = new ConcurrentHashMap<>();
    public final ConnectedAccountRepository repository = mock(ConnectedAccountRepository.class);
    private final AtomicLong ids = new AtomicLong();

    public InMemoryConnectedAccounts() {
        when(repository.save(any(ConnectedAccount.class)))
                .thenAnswer(
                        call -> {
                            ConnectedAccount account = call.getArgument(0);
                            if (account.getId() == null) {
                                account.setId(ids.incrementAndGet());
                                account.setCreatedAt(LocalDateTime.now());
                            }
                            rows.put(account.getId(), account);
                            return account;
                        });
        when(repository.findById(anyLong()))
                .thenAnswer(call -> Optional.ofNullable(rows.get(call.<Long>getArgument(0))));
        when(repository.findByOwnerUserIdAndProviderAndExternalId(
                        anyLong(), anyString(), anyString()))
                .thenAnswer(
                        call ->
                                rows.values().stream()
                                        .filter(
                                                a ->
                                                        a.getOwnerUserId()
                                                                        .equals(call.getArgument(0))
                                                                && a.getProvider()
                                                                        .equals(call.getArgument(1))
                                                                && a.getExternalId()
                                                                        .equals(
                                                                                call.getArgument(
                                                                                        2)))
                                        .findFirst());
        when(repository.findByOwnerUserIdOrderByCreatedAtAsc(anyLong()))
                .thenAnswer(
                        call ->
                                rows.values().stream()
                                        .filter(a -> a.getOwnerUserId().equals(call.getArgument(0)))
                                        .sorted(Comparator.comparing(ConnectedAccount::getId))
                                        .toList());
        doAnswer(
                        call -> {
                            rows.remove(call.<ConnectedAccount>getArgument(0).getId());
                            return null;
                        })
                .when(repository)
                .delete(any(ConnectedAccount.class));
    }

    /** Stores a connected account directly, as if its owner had finished signing in. */
    public ConnectedAccount add(long ownerUserId, CloudProvider provider, String refreshToken) {
        ConnectedAccount account = new ConnectedAccount();
        account.setOwnerUserId(ownerUserId);
        account.setProvider(provider.id());
        account.setExternalId("ext-" + ids.get());
        account.setEmail("pat@contoso.com");
        account.setRefreshToken(refreshToken);
        return repository.save(account);
    }
}
