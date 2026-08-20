package stirling.software.proprietary.model;

import io.quarkus.runtime.Startup;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Event;
import jakarta.inject.Inject;
import jakarta.persistence.PostPersist;

/**
 * Publishes {@link TeamCreatedEvent} on insert. JPA owns the listener instance it invokes, so the
 * CDI publisher is bridged via a static, set when the bean is created eagerly at startup.
 */
@Startup
@ApplicationScoped
public class TeamEntityListener {

    private static Event<TeamCreatedEvent> publisher;

    @Inject
    void setPublisher(Event<TeamCreatedEvent> teamCreatedEvent) {
        TeamEntityListener.publisher = teamCreatedEvent;
    }

    @PostPersist
    public void onCreate(Team team) {
        if (publisher != null) {
            publisher.fire(new TeamCreatedEvent(team.getId(), team.getName()));
        }
    }
}
