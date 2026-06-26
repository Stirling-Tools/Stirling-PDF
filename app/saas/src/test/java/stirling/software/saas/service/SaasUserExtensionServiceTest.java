package stirling.software.saas.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.proprietary.security.model.User;
import stirling.software.saas.model.SaasUserExtensions;
import stirling.software.saas.repository.SaasUserExtensionsRepository;

/**
 * Unit tests for {@link SaasUserExtensionService}.
 *
 * <p>Thin read/write facade over {@link SaasUserExtensionsRepository}. Reads return safe defaults
 * when no row exists; writes create the row lazily via {@code getOrCreate}. The repository is fully
 * mocked - no DB.
 */
@ExtendWith(MockitoExtension.class)
class SaasUserExtensionServiceTest {

    private static final long USER_ID = 42L;

    @Mock private SaasUserExtensionsRepository repository;

    @InjectMocks private SaasUserExtensionService service;

    private User user;

    @BeforeEach
    void setUp() {
        user = new User();
        user.setId(USER_ID);
    }

    @Nested
    @DisplayName("getOrCreate")
    class GetOrCreate {

        @Test
        @DisplayName("returns the existing row when one exists, without saving")
        void existing_returnedWithoutSave() {
            SaasUserExtensions existing = new SaasUserExtensions(user);
            when(repository.findByUserId(USER_ID)).thenReturn(Optional.of(existing));

            SaasUserExtensions result = service.getOrCreate(user);

            assertThat(result).isSameAs(existing);
            verify(repository, never()).save(any());
        }

        @Test
        @DisplayName("creates and saves a new row when none exists")
        void missing_createsAndSaves() {
            when(repository.findByUserId(USER_ID)).thenReturn(Optional.empty());
            when(repository.save(any(SaasUserExtensions.class)))
                    .thenAnswer(inv -> inv.getArgument(0));

            SaasUserExtensions result = service.getOrCreate(user);

            ArgumentCaptor<SaasUserExtensions> captor =
                    ArgumentCaptor.forClass(SaasUserExtensions.class);
            verify(repository).save(captor.capture());
            assertThat(captor.getValue().getUser()).isSameAs(user);
            assertThat(result).isSameAs(captor.getValue());
        }
    }

    @Nested
    @DisplayName("isMeteredBillingEnabled")
    class IsMeteredBillingEnabled {

        @Test
        @DisplayName("returns the stored flag when a row exists")
        void existing_returnsFlag() {
            SaasUserExtensions ext = new SaasUserExtensions(user);
            ext.setHasMeteredBillingEnabled(true);
            when(repository.findByUserId(USER_ID)).thenReturn(Optional.of(ext));

            assertThat(service.isMeteredBillingEnabled(user)).isTrue();
        }

        @Test
        @DisplayName("returns false when no row exists")
        void missing_returnsFalse() {
            when(repository.findByUserId(USER_ID)).thenReturn(Optional.empty());

            assertThat(service.isMeteredBillingEnabled(user)).isFalse();
            verify(repository, never()).save(any());
        }
    }

    @Nested
    @DisplayName("setMeteredBillingEnabled")
    class SetMeteredBillingEnabled {

        @Test
        @DisplayName("flips the flag on the existing row and saves it")
        void updatesExistingRow() {
            SaasUserExtensions ext = new SaasUserExtensions(user);
            when(repository.findByUserId(USER_ID)).thenReturn(Optional.of(ext));
            when(repository.save(any(SaasUserExtensions.class)))
                    .thenAnswer(inv -> inv.getArgument(0));

            service.setMeteredBillingEnabled(user, true);

            assertThat(ext.isMeteredBillingEnabled()).isTrue();
            // getOrCreate finds the existing row, then the explicit save in the setter persists.
            verify(repository).save(ext);
        }

        @Test
        @DisplayName("creates the row first when none exists, then persists the flag")
        void createsRowWhenMissing() {
            when(repository.findByUserId(USER_ID)).thenReturn(Optional.empty());
            when(repository.save(any(SaasUserExtensions.class)))
                    .thenAnswer(inv -> inv.getArgument(0));

            service.setMeteredBillingEnabled(user, false);

            ArgumentCaptor<SaasUserExtensions> captor =
                    ArgumentCaptor.forClass(SaasUserExtensions.class);
            // getOrCreate saves once (creation), the setter saves again.
            verify(repository, times(2)).save(captor.capture());
            assertThat(captor.getValue().isMeteredBillingEnabled()).isFalse();
        }
    }

    @Nested
    @DisplayName("getApiKeyFirstUsedAt")
    class GetApiKeyFirstUsedAt {

        @Test
        @DisplayName("returns the stored timestamp when a row exists")
        void existing_returnsTimestamp() {
            LocalDateTime ts = LocalDateTime.of(2024, 1, 2, 3, 4, 5);
            SaasUserExtensions ext = new SaasUserExtensions(user);
            ext.setApiKeyFirstUsedAt(ts);
            when(repository.findByUserId(USER_ID)).thenReturn(Optional.of(ext));

            assertThat(service.getApiKeyFirstUsedAt(user)).isEqualTo(ts);
        }

        @Test
        @DisplayName("returns null when no row exists")
        void missing_returnsNull() {
            when(repository.findByUserId(USER_ID)).thenReturn(Optional.empty());

            assertThat(service.getApiKeyFirstUsedAt(user)).isNull();
        }
    }

    @Nested
    @DisplayName("trackApiKeyFirstUse")
    class TrackApiKeyFirstUse {

        @Test
        @DisplayName("records the timestamp the first time and saves")
        void firstUse_recordsAndSaves() {
            SaasUserExtensions ext = new SaasUserExtensions(user);
            when(repository.findByUserId(USER_ID)).thenReturn(Optional.of(ext));
            when(repository.save(any(SaasUserExtensions.class)))
                    .thenAnswer(inv -> inv.getArgument(0));

            service.trackApiKeyFirstUse(user);

            assertThat(ext.getApiKeyFirstUsedAt()).isNotNull();
            verify(repository).save(ext);
        }

        @Test
        @DisplayName("is idempotent - does not overwrite or re-save when already set")
        void alreadySet_noOverwriteNoSave() {
            LocalDateTime original = LocalDateTime.of(2020, 5, 5, 5, 5, 5);
            SaasUserExtensions ext = new SaasUserExtensions(user);
            ext.setApiKeyFirstUsedAt(original);
            when(repository.findByUserId(USER_ID)).thenReturn(Optional.of(ext));

            service.trackApiKeyFirstUse(user);

            assertThat(ext.getApiKeyFirstUsedAt()).isEqualTo(original);
            // getOrCreate found the row (no save), and the guard skips the second save.
            verify(repository, never()).save(any());
        }

        @Test
        @DisplayName("creates the row, then records the timestamp when none exists")
        void missing_createsThenRecords() {
            when(repository.findByUserId(USER_ID)).thenReturn(Optional.empty());
            when(repository.save(any(SaasUserExtensions.class)))
                    .thenAnswer(inv -> inv.getArgument(0));

            service.trackApiKeyFirstUse(user);

            ArgumentCaptor<SaasUserExtensions> captor =
                    ArgumentCaptor.forClass(SaasUserExtensions.class);
            // getOrCreate save (creation) + first-use save.
            verify(repository, times(2)).save(captor.capture());
            assertThat(captor.getValue().getApiKeyFirstUsedAt()).isNotNull();
        }
    }
}
