package stirling.software.proprietary.repository;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.persistence.autoconfigure.EntityScan;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.FilterType;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.test.context.ContextConfiguration;

import stirling.software.proprietary.model.security.PersistentAuditEvent;
import stirling.software.proprietary.service.PortalAuditReadService;
import stirling.software.proprietary.service.PortalInfraAuditService;

import tools.jackson.databind.json.JsonMapper;

@DataJpaTest
@ContextConfiguration(classes = PortalInfraAuditWindowDbTest.TestApp.class)
class PortalInfraAuditWindowDbTest {

    @Autowired private PersistentAuditEventRepository repository;

    @Test
    void totalsCoverTheFullDayAndKeepTeamBoundariesBeyondFourHundredRows() {
        Instant now = Instant.now().minusSeconds(60);
        for (int i = 0; i < 450; i++) {
            save("alice", "PDF_PROCESS", now, "{\"path\":\"/api/v1/misc/compress-pdf\"}");
        }
        save("alice", "PDF_PROCESS", now, "{\"path\":\"/api/v1/policies/run\"}");
        save("alice", "PDF_PROCESS", now, "{\"path\":\"/api/v1/security/sign\"}");
        save("alice", "SETTINGS_CHANGED", now, "{}");
        save("bob", "PDF_PROCESS", now, "{}");
        save("alice", "UI_DATA", now, "{}");
        save("alice", "HTTP_REQUEST", now, "{}");
        save("alice", "PDF_PROCESS", now.minus(25, ChronoUnit.HOURS), "{}");
        save("alice", "PDF_PROCESS", now.plus(2, ChronoUnit.HOURS), "{}");
        repository.flush();

        PortalInfraAuditService service =
                new PortalInfraAuditService(
                        new PortalAuditReadService(repository), JsonMapper.builder().build());
        var server = service.serverAuditLog();
        var team = service.scopedAuditLog("team:alice", List.of("alice"));

        assertThat(server.getEvents()).hasSize(40);
        assertThat(server.getSummary().getTotalEvents()).isEqualTo(454);
        assertThat(server.getSummary().getProcessing()).isEqualTo(451);
        assertThat(server.getSummary().getPolicy()).isEqualTo(1);
        assertThat(server.getSummary().getConfig()).isEqualTo(1);
        assertThat(team.getSummary().getTotalEvents()).isEqualTo(453);
        assertThat(team.getSummary().getProcessing()).isEqualTo(450);
        assertThat(team.getEvents()).allMatch(event -> "alice".equals(event.getActor()));
        var empty = service.scopedAuditLog("team:empty", List.of());
        assertThat(empty.getEvents()).isEmpty();
        assertThat(empty.getSummary().getTotalEvents()).isZero();
    }

    @Test
    void timeWindowIncludesItsBoundariesAndExcludesNoise() {
        Instant until = Instant.now().truncatedTo(ChronoUnit.SECONDS);
        Instant since = until.minus(24, ChronoUnit.HOURS);
        save("alice", "PDF_PROCESS", since, "{}");
        save("alice", "PDF_PROCESS", until, "{}");
        save("alice", "PDF_PROCESS", since.minusSeconds(1), "{}");
        save("alice", "PDF_PROCESS", until.plusSeconds(1), "{}");
        save("alice", "UI_DATA", until, "{}");
        repository.flush();

        var rows =
                repository.findInfraEventsBetween(
                        List.of("UI_DATA", "HTTP_REQUEST"),
                        since,
                        until,
                        PageRequest.of(0, 400, Sort.by("id")));

        assertThat(rows.getContent())
                .extracting(PersistentAuditEvent::getTimestamp)
                .containsExactly(since, until);
        assertThat(rows.hasNext()).isFalse();
    }

    private void save(String principal, String type, Instant at, String data) {
        repository.save(
                PersistentAuditEvent.builder()
                        .principal(principal)
                        .type(type)
                        .timestamp(at)
                        .data(data)
                        .build());
    }

    @SpringBootConfiguration
    @EntityScan(basePackageClasses = PersistentAuditEvent.class)
    @EnableJpaRepositories(
            basePackageClasses = PersistentAuditEventRepository.class,
            includeFilters =
                    @ComponentScan.Filter(
                            type = FilterType.ASSIGNABLE_TYPE,
                            classes = PersistentAuditEventRepository.class))
    static class TestApp {}
}
