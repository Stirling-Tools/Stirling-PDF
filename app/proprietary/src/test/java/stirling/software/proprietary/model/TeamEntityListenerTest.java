package stirling.software.proprietary.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

@ExtendWith(MockitoExtension.class)
class TeamEntityListenerTest {

    @Mock private ApplicationEventPublisher publisher;

    private static Team team(Long id, String name) {
        Team team = new Team();
        team.setId(id);
        team.setName(name);
        return team;
    }

    @Test
    void publishesTeamCreatedEventOnPersist() {
        TeamEntityListener listener = new TeamEntityListener();
        listener.setPublisher(publisher);

        listener.onCreate(team(5L, "Acme"));

        ArgumentCaptor<TeamCreatedEvent> event = ArgumentCaptor.forClass(TeamCreatedEvent.class);
        org.mockito.Mockito.verify(publisher).publishEvent(event.capture());
        assertThat(event.getValue().teamId()).isEqualTo(5L);
        assertThat(event.getValue().teamName()).isEqualTo("Acme");
    }

    @Test
    void doesNotThrowWhenNoPublisherIsSet() {
        // JPA can build the listener before Spring wires the publisher; must be a safe no-op.
        TeamEntityListener listener = new TeamEntityListener();
        listener.setPublisher(null);

        assertThatCode(() -> listener.onCreate(team(1L, "X"))).doesNotThrowAnyException();
    }
}
