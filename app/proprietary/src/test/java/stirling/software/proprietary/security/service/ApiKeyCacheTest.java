package stirling.software.proprietary.security.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.lang.reflect.Method;
import java.time.Duration;
import java.util.Optional;

import org.apache.commons.codec.digest.DigestUtils;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.MessageSource;
import org.springframework.security.crypto.password.PasswordEncoder;

import stirling.software.common.cluster.KeyValueCache;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.database.repository.AuthorityRepository;
import stirling.software.proprietary.security.database.repository.PersistentLoginRepository;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamRepository;
import stirling.software.proprietary.security.session.SessionPersistentRegistry;
import stirling.software.proprietary.storage.repository.FileShareAccessRepository;
import stirling.software.proprietary.storage.repository.FileShareRepository;
import stirling.software.proprietary.storage.repository.StorageCleanupEntryRepository;
import stirling.software.proprietary.storage.repository.StoredFileRepository;
import stirling.software.proprietary.workflow.repository.WorkflowParticipantRepository;
import stirling.software.proprietary.workflow.repository.WorkflowSessionRepository;
import stirling.software.proprietary.workflow.service.UserServerCertificateService;

/** Contract tests for the distributed API-key cache in {@link UserService}. */
@ExtendWith(MockitoExtension.class)
class ApiKeyCacheTest {

    @Mock private UserRepository userRepository;
    @Mock private TeamRepository teamRepository;
    @Mock private AuthorityRepository authorityRepository;
    @Mock private PasswordEncoder passwordEncoder;
    @Mock private MessageSource messageSource;
    @Mock private SessionPersistentRegistry sessionRegistry;
    @Mock private DatabaseServiceInterface databaseService;
    @Mock private ApplicationProperties.Security.OAUTH2 oAuth2;
    @Mock private KeyValueCache keyValueCache;
    @Mock private PersistentLoginRepository persistentLoginRepository;
    @Mock private UserServerCertificateService userServerCertificateService;
    @Mock private WorkflowParticipantRepository workflowParticipantRepository;
    @Mock private WorkflowSessionRepository workflowSessionRepository;
    @Mock private StoredFileRepository storedFileRepository;
    @Mock private StorageCleanupEntryRepository storageCleanupEntryRepository;
    @Mock private FileShareRepository fileShareRepository;
    @Mock private FileShareAccessRepository fileShareAccessRepository;

    @InjectMocks private UserService userService;

    private static final String API_KEY = "my-api-key";
    private static final String API_KEY_NAMESPACE = "apikey";
    private static final String NEGATIVE_MARKER = "__none__";
    private static final String KEY_HASH = DigestUtils.sha256Hex(API_KEY);

    @BeforeEach
    void setUp() {}

    @Test
    void cacheHit_positive_skipsDbLookup() {
        User user = userWithKey("alice", API_KEY);
        when(keyValueCache.get(API_KEY_NAMESPACE, KEY_HASH)).thenReturn(Optional.of("alice"));
        when(userRepository.findByUsernameIgnoreCase("alice")).thenReturn(Optional.of(user));

        Optional<User> result = userService.getUserByApiKey(API_KEY);

        assertTrue(result.isPresent());
        assertSame(user, result.get());
        verify(userRepository, never()).findByApiKey(anyString());
    }

    @Test
    void cacheHit_butStoredKeyDrifted_evictsAndFallsThrough() {
        User stale = userWithKey("alice", "different-key-now");
        when(keyValueCache.get(API_KEY_NAMESPACE, KEY_HASH)).thenReturn(Optional.of("alice"));
        when(userRepository.findByUsernameIgnoreCase("alice")).thenReturn(Optional.of(stale));
        when(userRepository.findByApiKey(API_KEY)).thenReturn(Optional.empty());

        Optional<User> result = userService.getUserByApiKey(API_KEY);

        assertEquals(Optional.empty(), result);
        verify(keyValueCache).evict(API_KEY_NAMESPACE, KEY_HASH);
        verify(userRepository).findByApiKey(API_KEY);
    }

    @Test
    void cacheHit_negativeMarker_returnsEmptyWithoutDbLookup() {
        when(keyValueCache.get(API_KEY_NAMESPACE, KEY_HASH))
                .thenReturn(Optional.of(NEGATIVE_MARKER));

        Optional<User> result = userService.getUserByApiKey(API_KEY);

        assertEquals(Optional.empty(), result);
        verify(userRepository, never()).findByApiKey(anyString());
        verify(userRepository, never()).findByUsernameIgnoreCase(anyString());
    }

    @Test
    void cacheMiss_repoHit_populatesPositiveEntry() {
        User user = userWithKey("alice", API_KEY);
        when(keyValueCache.get(API_KEY_NAMESPACE, KEY_HASH)).thenReturn(Optional.empty());
        when(userRepository.findByApiKey(API_KEY)).thenReturn(Optional.of(user));

        Optional<User> result = userService.getUserByApiKey(API_KEY);

        assertTrue(result.isPresent());
        verify(keyValueCache)
                .put(eq(API_KEY_NAMESPACE), eq(KEY_HASH), eq("alice"), any(Duration.class));
    }

    @Test
    void cacheMiss_repoEmpty_populatesNegativeMarker() {
        when(keyValueCache.get(API_KEY_NAMESPACE, KEY_HASH)).thenReturn(Optional.empty());
        when(userRepository.findByApiKey(API_KEY)).thenReturn(Optional.empty());

        Optional<User> result = userService.getUserByApiKey(API_KEY);

        assertEquals(Optional.empty(), result);
        verify(keyValueCache)
                .put(eq(API_KEY_NAMESPACE), eq(KEY_HASH), eq(NEGATIVE_MARKER), any(Duration.class));
    }

    @Test
    void negativeTtl_shorterThanPositiveTtl() {
        when(keyValueCache.get(API_KEY_NAMESPACE, KEY_HASH)).thenReturn(Optional.empty());

        when(userRepository.findByApiKey(API_KEY)).thenReturn(Optional.empty());
        userService.getUserByApiKey(API_KEY);
        ArgumentCaptor<Duration> negativeTtl = ArgumentCaptor.forClass(Duration.class);
        verify(keyValueCache)
                .put(
                        eq(API_KEY_NAMESPACE),
                        eq(KEY_HASH),
                        eq(NEGATIVE_MARKER),
                        negativeTtl.capture());

        reset(keyValueCache);
        when(keyValueCache.get(API_KEY_NAMESPACE, KEY_HASH)).thenReturn(Optional.empty());
        when(userRepository.findByApiKey(API_KEY))
                .thenReturn(Optional.of(userWithKey("alice", API_KEY)));
        userService.getUserByApiKey(API_KEY);
        ArgumentCaptor<Duration> positiveTtl = ArgumentCaptor.forClass(Duration.class);
        verify(keyValueCache)
                .put(eq(API_KEY_NAMESPACE), eq(KEY_HASH), eq("alice"), positiveTtl.capture());

        assertTrue(
                negativeTtl.getValue().compareTo(positiveTtl.getValue()) < 0,
                "negative TTL must be shorter than positive TTL");
    }

    @Test
    void nullApiKey_bypassesCacheEntirely() {
        userService.getUserByApiKey(null);

        verifyNoInteractions(keyValueCache);
        verify(userRepository).findByApiKey(null);
    }

    @Test
    void blankApiKey_bypassesCacheEntirely() {
        userService.getUserByApiKey("   ");

        verifyNoInteractions(keyValueCache);
        verify(userRepository).findByApiKey("   ");
    }

    @Test
    void evictApiKeyCache_invokesCacheEvict() {
        userService.evictApiKeyCache(API_KEY);
        verify(keyValueCache).evict(API_KEY_NAMESPACE, KEY_HASH);
    }

    @Test
    void evictApiKeyCache_nullOrBlankInputs_noOp() {
        userService.evictApiKeyCache(null);
        userService.evictApiKeyCache("");
        userService.evictApiKeyCache("    ");
        verifyNoInteractions(keyValueCache);
    }

    @Test
    void rotation_viaSaveUser_evictsPreviousKey() throws Exception {
        // Reach into the private saveUser(Optional<User>, String) helper to model rotation
        // happening as it does in production (addApiKeyToUser / refreshApiKeyForUser).
        User user = userWithKey("alice", "previous-key");
        String previousKey = user.getApiKey();
        when(userRepository.save(any(User.class))).thenAnswer(inv -> inv.getArgument(0));

        Method saveUser =
                UserService.class.getDeclaredMethod("saveUser", Optional.class, String.class);
        saveUser.setAccessible(true);
        saveUser.invoke(userService, Optional.of(user), "new-key");

        verify(keyValueCache).evict(API_KEY_NAMESPACE, DigestUtils.sha256Hex(previousKey));
    }

    @Test
    void rotation_whenPreviousKeyBlank_skipsEviction() throws Exception {
        // First-time API key creation: no previous key to evict.
        User user = userWithKey("bob", null);
        when(userRepository.save(any(User.class))).thenAnswer(inv -> inv.getArgument(0));

        Method saveUser =
                UserService.class.getDeclaredMethod("saveUser", Optional.class, String.class);
        saveUser.setAccessible(true);
        saveUser.invoke(userService, Optional.of(user), "brand-new-key");

        verify(keyValueCache, never()).evict(anyString(), anyString());
    }

    @Test
    void syncCustomApiUser_rotatesKey_evictsPreviousKeyFromClusterCache() {
        User existing = userWithKey("CUSTOM_API_USER", "old-custom-key");
        when(userRepository.findByUsernameIgnoreCase("CUSTOM_API_USER"))
                .thenReturn(Optional.of(existing));
        when(userRepository.save(any(User.class))).thenAnswer(inv -> inv.getArgument(0));

        userService.syncCustomApiUser("new-custom-key");

        verify(keyValueCache).evict(API_KEY_NAMESPACE, DigestUtils.sha256Hex("old-custom-key"));
    }

    @Test
    void syncCustomApiUser_keyUnchanged_noEviction() {
        // When the supplied key matches what is already stored, no save and no eviction.
        User existing = userWithKey("CUSTOM_API_USER", "stable-custom-key");
        when(userRepository.findByUsernameIgnoreCase("CUSTOM_API_USER"))
                .thenReturn(Optional.of(existing));

        userService.syncCustomApiUser("stable-custom-key");

        verify(userRepository, never()).save(any(User.class));
        verify(keyValueCache, never()).evict(anyString(), anyString());
    }

    @Test
    void syncCustomApiUser_newUser_skipsEviction_noPreviousKey() {
        // First-time bootstrap: no previous key for the freshly-created CUSTOM_API_USER.
        when(userRepository.findByUsernameIgnoreCase("CUSTOM_API_USER"))
                .thenReturn(Optional.empty());
        when(userRepository.save(any(User.class))).thenAnswer(inv -> inv.getArgument(0));

        userService.syncCustomApiUser("brand-new-key");

        verify(keyValueCache, never()).evict(anyString(), anyString());
    }

    @Test
    void loadUserByApiKey_isAlsoCached() {
        // Pre-condition: loadUserByApiKey goes through the same private cached helper.
        User user = userWithKey("alice", API_KEY);
        when(keyValueCache.get(API_KEY_NAMESPACE, KEY_HASH)).thenReturn(Optional.of("alice"));
        when(userRepository.findByUsernameIgnoreCase("alice")).thenReturn(Optional.of(user));

        Optional<User> result = userService.loadUserByApiKey(API_KEY);

        assertTrue(result.isPresent());
        verify(userRepository, never()).findByApiKey(anyString());
    }

    @Test
    void distinctKeys_hashToDistinctCacheSlots() {
        // Smoke check: two random keys must not collide in the cache namespace.
        when(keyValueCache.get(API_KEY_NAMESPACE, DigestUtils.sha256Hex("k1")))
                .thenReturn(Optional.empty());
        when(keyValueCache.get(API_KEY_NAMESPACE, DigestUtils.sha256Hex("k2")))
                .thenReturn(Optional.empty());
        when(userRepository.findByApiKey("k1")).thenReturn(Optional.empty());
        when(userRepository.findByApiKey("k2")).thenReturn(Optional.empty());

        userService.getUserByApiKey("k1");
        userService.getUserByApiKey("k2");

        verify(keyValueCache, times(1))
                .put(
                        eq(API_KEY_NAMESPACE),
                        eq(DigestUtils.sha256Hex("k1")),
                        eq(NEGATIVE_MARKER),
                        any(Duration.class));
        verify(keyValueCache, times(1))
                .put(
                        eq(API_KEY_NAMESPACE),
                        eq(DigestUtils.sha256Hex("k2")),
                        eq(NEGATIVE_MARKER),
                        any(Duration.class));
    }

    private User userWithKey(String username, String apiKey) {
        User user = new User();
        user.setUsername(username);
        user.setApiKey(apiKey);
        return user;
    }
}
