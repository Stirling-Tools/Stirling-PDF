package stirling.software.proprietary.model;

import org.springframework.context.ApplicationEventPublisher;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.PostPersist;

/** Publishes {@link TeamCreatedEvent} on insert; Spring bridges the publisher via a static. */
@ApplicationScoped
public class TeamEntityListener {

    private static ApplicationEventPublisher publisher;

    @Inject
    void setPublisher(ApplicationEventPublisher applicationEventPublisher) {
        TeamEntityListener.publisher = applicationEventPublisher;
    }

    @PostPersist
    public void onCreate(Team team) {
        if (publisher != null) {
            publisher.publishEvent(new TeamCreatedEvent(team.getId(), team.getName()));
        }
    }
}
