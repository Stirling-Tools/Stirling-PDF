package stirling.software.saas.accountlink;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile("saas")
@RequestMapping("/api/v1/instance/seats")
@ConditionalOnProperty(name = "stirling.billing.account-link.enabled", havingValue = "true")
public class FleetSeatController {
    private final FleetSeatService seats;

    public FleetSeatController(FleetSeatService seats) {
        this.seats = seats;
    }

    public record Report(int users, boolean admit) {}

    /**
     * Device identity determines both team and deployment; neither is accepted from the request
     * body.
     */
    @PostMapping
    @PreAuthorize("hasRole('LINKED_INSTANCE')")
    public ResponseEntity<FleetSeatService.Snapshot> report(
            Authentication auth, @RequestBody Report report) {
        if (!(auth instanceof LinkedInstanceAuthenticationToken token)) {
            return ResponseEntity.status(401).build();
        }
        if (report.users() < 0 || report.users() == Integer.MAX_VALUE) {
            return ResponseEntity.badRequest().build();
        }
        return ResponseEntity.ok(
                seats.report(
                        token.getTeamId(), token.getInstanceId(), report.users(), report.admit()));
    }
}
