package stirling.software.saas.accountlink;

import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Profile("saas")
public class FleetSeatService {
    private final JdbcTemplate jdbc;

    public FleetSeatService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record Snapshot(
            boolean allowed, long usersInUse, int capacity, long unreportedInstances) {}

    /**
     * Reports one authenticated deployment and optionally reserves its next user under the team
     * capacity lock.
     */
    @Transactional
    public Snapshot report(Long teamId, Long instanceId, int users, boolean admit) {
        if (users < 0 || users == Integer.MAX_VALUE) {
            throw new IllegalArgumentException("Invalid deployment seat count");
        }
        return jdbc.queryForObject(
                "SELECT * FROM public.fleet_report_seats(?, ?, ?, ?)",
                (rs, row) ->
                        new Snapshot(
                                rs.getBoolean("allowed"),
                                rs.getLong("users_in_use"),
                                rs.getInt("capacity"),
                                rs.getLong("unreported_instances")),
                teamId,
                instanceId,
                users,
                admit);
    }
}
