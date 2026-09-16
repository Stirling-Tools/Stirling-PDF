package stirling.software.saas.accountlink;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.*;

import org.junit.jupiter.api.Test;
import org.springframework.security.core.Authentication;

class FleetSeatControllerTest {
    @Test
    void requiresDeviceIdentityAndPinsTheTeam() {
        var seats = mock(FleetSeatService.class);
        var controller = new FleetSeatController(seats);
        var request = new FleetSeatController.Report(9, true);
        assertEquals(
                401,
                controller.report(mock(Authentication.class), request).getStatusCode().value());
        verifyNoInteractions(seats);
        var token = mock(LinkedInstanceAuthenticationToken.class);
        when(token.getTeamId()).thenReturn(1L);
        when(token.getInstanceId()).thenReturn(2L);
        controller.report(token, request);
        verify(seats).report(1L, 2L, 9, true);
        assertEquals(
                400,
                controller
                        .report(token, new FleetSeatController.Report(-1, false))
                        .getStatusCode()
                        .value());
        verifyNoMoreInteractions(seats);
    }
}
