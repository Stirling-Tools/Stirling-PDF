package stirling.software.SPDF.config;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import org.junit.jupiter.api.Test;

import stirling.software.common.configuration.interfaces.ShowAdminInterface;
import stirling.software.common.model.ApplicationProperties;

class AppUpdateServiceTest {

    @Test
    void shouldShowWhenShowUpdateTrueAndShowAdminNull() {
        ApplicationProperties props = createProps(true);
        AppUpdateService service = new AppUpdateService(props, null);
        assertTrue(service.shouldShow());
    }

    @Test
    void shouldNotShowWhenShowUpdateFalse() {
        ApplicationProperties props = createProps(false);
        AppUpdateService service = new AppUpdateService(props, null);
        assertFalse(service.shouldShow());
    }

    @Test
    void shouldShowWhenShowUpdateTrueAndAdminReturnsTrue() {
        ApplicationProperties props = createProps(true);
        ShowAdminInterface showAdmin = mock(ShowAdminInterface.class);
        when(showAdmin.getShowUpdateOnlyAdmins()).thenReturn(true);
        AppUpdateService service = new AppUpdateService(props, showAdmin);
        assertTrue(service.shouldShow());
    }

    @Test
    void shouldNotShowWhenShowUpdateTrueAndAdminReturnsFalse() {
        ApplicationProperties props = createProps(true);
        ShowAdminInterface showAdmin = mock(ShowAdminInterface.class);
        when(showAdmin.getShowUpdateOnlyAdmins()).thenReturn(false);
        AppUpdateService service = new AppUpdateService(props, showAdmin);
        assertFalse(service.shouldShow());
    }

    @Test
    void shouldNotShowWhenShowUpdateFalseAndAdminReturnsTrue() {
        ApplicationProperties props = createProps(false);
        ShowAdminInterface showAdmin = mock(ShowAdminInterface.class);
        when(showAdmin.getShowUpdateOnlyAdmins()).thenReturn(true);
        AppUpdateService service = new AppUpdateService(props, showAdmin);
        assertFalse(service.shouldShow());
    }

    @Test
    void shouldNotShowWhenBothFalse() {
        ApplicationProperties props = createProps(false);
        ShowAdminInterface showAdmin = mock(ShowAdminInterface.class);
        when(showAdmin.getShowUpdateOnlyAdmins()).thenReturn(false);
        AppUpdateService service = new AppUpdateService(props, showAdmin);
        assertFalse(service.shouldShow());
    }

    private ApplicationProperties createProps(boolean showUpdate) {
        ApplicationProperties props = new ApplicationProperties();
        ApplicationProperties.System system = new ApplicationProperties.System();
        system.setShowUpdate(showUpdate);
        props.setSystem(system);
        return props;
    }
}
