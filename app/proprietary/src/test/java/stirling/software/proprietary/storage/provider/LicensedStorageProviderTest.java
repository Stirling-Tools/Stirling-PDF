package stirling.software.proprietary.storage.provider;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.io.IOException;
import java.util.concurrent.atomic.AtomicBoolean;

import org.junit.jupiter.api.Test;

class LicensedStorageProviderTest {
    @Test
    void expiryBlocksNewWritesButPreservesReadingAndReconnectRestoresWrites() throws Exception {
        StorageProvider delegate = mock(StorageProvider.class);
        AtomicBoolean paid = new AtomicBoolean(true);
        var provider = new LicensedStorageProvider(delegate, paid::get);
        provider.store(null, null);
        paid.set(false);
        assertThatThrownBy(() -> provider.store(null, null)).isInstanceOf(IOException.class);
        provider.load("existing");
        verify(delegate).load("existing");
        paid.set(true);
        provider.store(null, null);
        verify(delegate, times(2)).store(null, null);
    }
}
