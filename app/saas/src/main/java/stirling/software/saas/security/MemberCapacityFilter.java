package stirling.software.saas.security;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.regex.Pattern;

import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import stirling.software.common.model.enumeration.TeamRole;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.model.TeamMembership;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamMembershipRepository;
import stirling.software.saas.service.TeamMemberCapacityService;

import tools.jackson.databind.ObjectMapper;

/**
 * Refuses API requests from a member their team's user allowance no longer covers, whether they
 * come with a session or an API key. The 403 names the team and its leaders so the app can say who
 * to ask. Leaving the team is the one call still allowed: it returns the member to their own free
 * workspace.
 *
 * <p>Runs after bearer-token authentication, when the principal is the resolved {@link User}.
 */
@Component
@Profile("saas")
public class MemberCapacityFilter extends OncePerRequestFilter {

    public static final String ERROR = "MEMBER_OVER_PLAN_LIMIT";
    private static final Pattern LEAVE = Pattern.compile("^/api/v1/team/\\d+/leave$");

    private final TeamMemberCapacityService capacity;
    private final TeamMembershipRepository membershipRepository;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public MemberCapacityFilter(
            TeamMemberCapacityService capacity, TeamMembershipRepository membershipRepository) {
        this.capacity = Objects.requireNonNull(capacity, "capacity");
        this.membershipRepository =
                Objects.requireNonNull(membershipRepository, "membershipRepository");
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI().substring(request.getContextPath().length());
        return !path.startsWith("/api/")
                || (HttpMethod.POST.matches(request.getMethod()) && LEAVE.matcher(path).matches());
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null
                && auth.getPrincipal() instanceof User user
                && user.getTeam() != null
                && capacity.isDisabled(user.getTeam().getId(), user.getId())) {
            refuse(response, user.getTeam());
            return;
        }
        chain.doFilter(request, response);
    }

    private void refuse(HttpServletResponse response, Team team) throws IOException {
        List<String> leaders =
                membershipRepository.findByTeamIdAndRole(team.getId(), TeamRole.LEADER).stream()
                        .map(TeamMembership::getUser)
                        .map(u -> u.getEmail() != null ? u.getEmail() : u.getUsername())
                        .filter(Objects::nonNull)
                        .toList();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("error", ERROR);
        body.put(
                "message",
                "Your team's plan doesn't cover your account right now. Ask a team leader to renew"
                        + " the plan or make your account active.");
        body.put("teamId", team.getId());
        body.put("teamName", team.getName());
        body.put("leaders", leaders);
        response.setStatus(HttpStatus.FORBIDDEN.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        response.getOutputStream().write(objectMapper.writeValueAsBytes(body));
    }
}
