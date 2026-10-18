package stirling.software.proprietary.connectedaccount;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.integration.crypto.CredentialEncryption;
import stirling.software.proprietary.policy.remote.ExpiringTokenCache;
import stirling.software.proprietary.security.model.User;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

@Slf4j
@Service
public class ConnectedAccountService {

    static final Duration STATE_LIFETIME = Duration.ofMinutes(10);
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final SecureRandom RANDOM = new SecureRandom();

    private final ConnectedAccountRepository accounts;
    private final Map<CloudProvider, CloudOAuthClient> clients = new EnumMap<>(CloudProvider.class);
    private final ExpiringTokenCache accessCache = new ExpiringTokenCache(Duration.ofMinutes(2));
    private final Map<Long, Object> refreshLocks = new ConcurrentHashMap<>();

    public ConnectedAccountService(
            ConnectedAccountRepository accounts, List<CloudOAuthClient> clients) {
        this.accounts = accounts;
        for (CloudOAuthClient client : clients) {
            this.clients.put(client.provider(), client);
        }
    }

    public boolean isAvailable(CloudProvider provider) {
        CloudOAuthClient client = clients.get(provider);
        return client != null && client.available();
    }

    public ConnectStart startConnect(User user, CloudProvider provider, String redirectUri) {
        CloudOAuthClient client = requireAvailable(provider);
        String verifier = randomToken();
        String nonce = randomToken();
        ObjectNode state = JSON.createObjectNode();
        state.put("n", nonce);
        state.put("u", user.getId());
        state.put("p", provider.id());
        state.put("v", verifier);
        state.put("r", redirectUri);
        state.put("e", Instant.now().plus(STATE_LIFETIME).getEpochSecond());
        String sealed =
                Base64.getUrlEncoder()
                        .withoutPadding()
                        .encodeToString(
                                CredentialEncryption.encryptBytes(
                                        state.toString().getBytes(StandardCharsets.UTF_8)));
        return new ConnectStart(
                client.authorizationUrl(sealed, challenge(verifier), redirectUri), nonce);
    }

    public record ConnectStart(String authorizationUrl, String nonce) {}

    public ConnectedAccount completeConnect(
            CloudProvider provider, String sealedState, String code, String browserNonce)
            throws IOException {
        JsonNode state = openState(sealedState);
        if (browserNonce == null
                || !MessageDigest.isEqual(
                        browserNonce.getBytes(StandardCharsets.UTF_8),
                        state.path("n").asString().getBytes(StandardCharsets.UTF_8))) {
            throw new IllegalArgumentException(
                    "this sign-in was started in another browser; start it again from Stirling");
        }
        if (!provider.id().equals(state.path("p").asString())) {
            throw new IllegalArgumentException("sign-in response is for a different provider");
        }
        if (Instant.now().getEpochSecond() > state.path("e").asLong()) {
            throw new IllegalArgumentException("sign-in took too long; please try again");
        }
        CloudOAuthClient client = requireAvailable(provider);
        OAuthTokens tokens =
                client.exchangeCode(code, state.path("v").asString(), state.path("r").asString());
        if (tokens.refreshToken() == null) {
            throw new IOException(
                    "the provider did not grant offline access, so pipelines could not use it");
        }
        long userId = state.path("u").asLong();
        OAuthTokens.AccountIdentity identity = tokens.identity();
        ConnectedAccount account =
                accounts.findByOwnerUserIdAndProviderAndExternalId(
                                userId, provider.id(), identity.externalId())
                        .orElseGet(ConnectedAccount::new);
        account.setOwnerUserId(userId);
        account.setProvider(provider.id());
        account.setExternalId(identity.externalId());
        account.setTenantId(identity.tenantId());
        account.setEmail(identity.email());
        account.setDisplayName(identity.displayName());
        account.setRefreshToken(tokens.refreshToken());
        account.setGrantedScopes(tokens.scope());
        account.setStatus(ConnectedAccount.STATUS_CONNECTED);
        account.setLastError(null);
        ConnectedAccount saved = accounts.save(account);
        evict(saved.getId());
        cache(saved.getId(), List.of(), tokens);
        return saved;
    }

    public List<ConnectedAccount> list(User user) {
        return accounts.findByOwnerUserIdOrderByCreatedAtAsc(user.getId());
    }

    public Optional<ConnectedAccount> findOwned(User user, long accountId) {
        return accounts.findById(accountId)
                .filter(account -> account.getOwnerUserId().equals(user.getId()));
    }

    public Optional<ConnectedAccount> find(long accountId) {
        return accounts.findById(accountId);
    }

    public void disconnect(User user, long accountId) {
        ConnectedAccount account =
                findOwned(user, accountId)
                        .orElseThrow(() -> new IllegalArgumentException("no such account"));
        CloudOAuthClient client = clients.get(account.cloudProvider());
        if (client != null && account.getRefreshToken() != null) {
            client.revoke(account.getRefreshToken());
        }
        accounts.delete(account);
        evict(accountId);
    }

    public String accessToken(long accountId, List<String> scopes) throws IOException {
        String key = cacheKey(accountId, scopes);
        String cached = accessCache.peek(key);
        if (cached != null) {
            return cached;
        }
        synchronized (refreshLocks.computeIfAbsent(accountId, id -> new Object())) {
            cached = accessCache.peek(key);
            if (cached != null) {
                return cached;
            }
            ConnectedAccount account =
                    accounts.findById(accountId)
                            .orElseThrow(
                                    () ->
                                            new AccountReconnectRequiredException(
                                                    "the connected account was removed"));
            if (!ConnectedAccount.STATUS_CONNECTED.equals(account.getStatus())) {
                throw new AccountReconnectRequiredException(reconnectMessage(account));
            }
            CloudOAuthClient client = clients.get(account.cloudProvider());
            if (client == null || !client.available()) {
                throw new IOException(
                        account.cloudProvider().id()
                                + " account connections are turned off on this server");
            }
            OAuthTokens tokens;
            try {
                tokens = client.refresh(account.getRefreshToken(), scopes);
            } catch (OAuthException e) {
                if (e.isRevoked()) {
                    account.setStatus(ConnectedAccount.STATUS_NEEDS_RECONNECT);
                    account.setLastError(e.getMessage());
                    accounts.save(account);
                    evict(accountId);
                    throw new AccountReconnectRequiredException(reconnectMessage(account));
                }
                throw e;
            }
            if (tokens.refreshToken() != null
                    && !tokens.refreshToken().equals(account.getRefreshToken())) {
                account.setRefreshToken(tokens.refreshToken());
                accounts.save(account);
            }
            return cache(accountId, scopes, tokens);
        }
    }

    private String cache(long accountId, List<String> scopes, OAuthTokens tokens) {
        return accessCache.put(
                cacheKey(accountId, scopes),
                new ExpiringTokenCache.Token(tokens.accessToken(), tokens.expiresInSeconds()));
    }

    private void evict(long accountId) {
        String prefix = accountId + "|";
        accessCache.evictIf(key -> key.startsWith(prefix));
    }

    private static String cacheKey(long accountId, List<String> scopes) {
        return accountId + "|" + (scopes == null ? "" : String.join(" ", scopes));
    }

    private static String reconnectMessage(ConnectedAccount account) {
        String who = account.getEmail() == null ? "the connected account" : account.getEmail();
        return "Stirling can no longer use "
                + who
                + "; sign in again from Settings > Connected accounts";
    }

    private CloudOAuthClient requireAvailable(CloudProvider provider) {
        CloudOAuthClient client = clients.get(provider);
        if (client == null || !client.available()) {
            throw new IllegalStateException(
                    provider.id() + " account connections are not set up on this server");
        }
        return client;
    }

    private static JsonNode openState(String sealed) {
        try {
            byte[] plain = CredentialEncryption.decryptBytes(Base64.getUrlDecoder().decode(sealed));
            return JSON.readTree(new String(plain, StandardCharsets.UTF_8));
        } catch (RuntimeException e) {
            throw new IllegalArgumentException("sign-in response could not be verified");
        }
    }

    private static String randomToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static String challenge(String verifier) {
        try {
            byte[] digest =
                    MessageDigest.getInstance("SHA-256")
                            .digest(verifier.getBytes(StandardCharsets.US_ASCII));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
