package stirling.software.proprietary.accountlink;

import static org.mockito.Mockito.RETURNS_SELF;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.servlet.config.annotation.InterceptorRegistration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;

/** Verifies the gate is registered everywhere except a desktop bundle. */
class AccountLinkWebMvcConfigTest {

    private static final String TAURI_MODE = "STIRLING_PDF_TAURI_MODE";

    private final InstanceEntitlementInterceptor interceptor =
            mock(InstanceEntitlementInterceptor.class);
    private final InterceptorRegistry registry = mock(InterceptorRegistry.class);

    /** The real registry hands back a registration to chain path patterns onto. */
    @BeforeEach
    void stubRegistration() {
        when(registry.addInterceptor(interceptor))
                .thenReturn(mock(InterceptorRegistration.class, RETURNS_SELF));
    }

    @AfterEach
    void clearTauriMode() {
        System.clearProperty(TAURI_MODE);
    }

    @Test
    void aServerRegistersTheGate() {
        new AccountLinkWebMvcConfig(interceptor).addInterceptors(registry);

        verify(registry).addInterceptor(interceptor);
    }

    @Test
    void aDesktopBundleRegistersNothing() {
        System.setProperty(TAURI_MODE, "true");

        new AccountLinkWebMvcConfig(interceptor).addInterceptors(registry);

        verify(registry, never()).addInterceptor(interceptor);
    }

    /** A server can present a desktop-looking client, so only the build property counts. */
    @Test
    void anUnparseableTauriModeIsNotDesktop() {
        System.setProperty(TAURI_MODE, "Client-Browser");

        new AccountLinkWebMvcConfig(interceptor).addInterceptors(registry);

        verify(registry).addInterceptor(interceptor);
    }
}
