package stirling.software.proprietary.model;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;

import jakarta.persistence.PostPersist;

/**
 * Publishes a {@link TeamCreatedEvent} when a team is first persisted. JPA builds the listener, so
 * the publisher is bridged in via a static field set by Spring.
 */
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
