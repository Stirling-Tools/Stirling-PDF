package stirling.software.proprietary.policy.seed;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.model.TeamCreatedEvent;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.store.PolicyStore;
import stirling.software.proprietary.security.repository.TeamRepository;
import stirling.software.proprietary.security.service.TeamService;

@ExtendWith(MockitoExtension.class)
class DefaultClassificationPolicySeederTest {

    @Mock private PolicyStore policyStore;
    @Mock private TeamRepository teamRepository;

    private DefaultClassificationPolicySeeder seeder() {
        return new DefaultClassificationPolicySeeder(policyStore, teamRepository);
    }

    private static Policy classificationPolicy(Long teamId) {
        return new Policy(
                "p1",
                "Classification Policy",
                "system",
                true,
                null,
                List.of(),
                List.of(),
                new OutputSpec("inline", Map.of("categoryId", "classification")),
                teamId);
    }

    @Test
    void seedsAnEnabledClassificationPolicyWhenTheTeamHasNone() {
        when(policyStore.findByTeam(7L)).thenReturn(List.of());

        seeder().onTeamCreated(new TeamCreatedEvent(7L, "Acme"));

        ArgumentCaptor<Policy> saved = ArgumentCaptor.forClass(Policy.class);
        verify(policyStore).save(saved.capture());
        Policy policy = saved.getValue();
        assertThat(policy.enabled()).isTrue();
        assertThat(policy.teamId()).isEqualTo(7L);
        assertThat(policy.output().type()).isEqualTo("inline");
        assertThat(policy.output().options().get("categoryId")).isEqualTo("classification");
        assertThat(policy.output().options().get("runOn")).isEqualTo("upload");
        assertThat(policy.output().options().get("mode")).isEqualTo("new_version");
        assertThat(policy.output().options().get("sources")).isEqualTo(List.of("editor"));
        assertThat(policy.steps()).hasSize(1);
        assertThat(policy.steps().get(0).operation())
                .isEqualTo("/api/v1/ai/tools/classify-and-label");
    }

    @Test
    void doesNotSeedWhenAClassificationPolicyAlreadyExists() {
        when(policyStore.findByTeam(7L)).thenReturn(List.of(classificationPolicy(7L)));

        seeder().onTeamCreated(new TeamCreatedEvent(7L, "Acme"));

        verify(policyStore, never()).save(any());
    }

    @Test
    void doesNotSeedForTheInternalTeam() {
        seeder().onTeamCreated(new TeamCreatedEvent(2L, "Internal"));

        verify(policyStore, never()).findByTeam(anyLong());
        verify(policyStore, never()).save(any());
    }

    @Test
    void doesNotSeedWhenTeamIdIsNull() {
        seeder().onTeamCreated(new TeamCreatedEvent(null, "Acme"));

        verify(policyStore, never()).save(any());
    }

    @Test
    void seedsTheDefaultTeamOnStartupWhenItExistsAndHasNoPolicy() {
        Team defaultTeam = new Team();
        defaultTeam.setId(1L);
        defaultTeam.setName(TeamService.DEFAULT_TEAM_NAME);
        when(teamRepository.findByName(TeamService.DEFAULT_TEAM_NAME))
                .thenReturn(Optional.of(defaultTeam));
        when(policyStore.findByTeam(1L)).thenReturn(List.of());

        seeder().seedDefaultTeamOnStartup();

        verify(policyStore).save(any());
    }

    @Test
    void doesNotSeedOnStartupWhenThereIsNoDefaultTeam() {
        when(teamRepository.findByName(TeamService.DEFAULT_TEAM_NAME)).thenReturn(Optional.empty());

        seeder().seedDefaultTeamOnStartup();

        verify(policyStore, never()).save(any());
    }
}
