package stirling.software.SPDF.service;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import stirling.software.common.service.MobileScannerService;

class MobileLanListenerTest {

    @ParameterizedTest
    @ValueSource(strings = {"127.0.0.1", "::1", "localhost", " 127.0.0.1 "})
    void loopbackAddressesCount(String address) {
        assertTrue(MobileLanListener.isLoopbackAddress(address));
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "0.0.0.0", "192.168.1.20", "::"})
    void otherAddressesDoNot(String address) {
        assertFalse(MobileLanListener.isLoopbackAddress(address));
    }

    @Test
    void staysOffOutsideTheDesktopApp() {
        MobileLanListener listener =
                new MobileLanListener(mock(MobileScannerService.class), "127.0.0.1");

        assertFalse(listener.isEnabled());
        assertTrue(listener.open().isEmpty());
    }
}
