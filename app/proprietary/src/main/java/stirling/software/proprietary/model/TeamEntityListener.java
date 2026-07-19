package stirling.software.proprietary.model;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;

import jakarta.persistence.PostPersist;

/** Publishes {@link TeamCreatedEvent} on insert; Spring bridges the publisher via a static. */
@Component
public class TeamEntityListener {

    private static ApplicationEventPublisher publisher;

    @Autowired
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
