package stirling.software.SPDF.config;


import org.springframework.context.ApplicationListener;
import org.springframework.context.event.ContextRefreshedEvent;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

@Component
public class StartupApplicationListener implements ApplicationListener<ContextRefreshedEvent> {

    public static LocalDateTime startTime;

    @Override
    public void onApplicationEvent(ContextRefreshedEvent event) {
        startTime = LocalDateTime.now();
    }
}
 
