/**
 * Description: Enter description
 * Author: Your Name
 * Date: 2025-06-19
 * Time: 17:06:51
 */


package stirling.software.SPDF.config;

import java.time.LocalDateTime;

import org.springframework.context.ApplicationListener;
import org.springframework.context.event.ContextRefreshedEvent;
import org.springframework.stereotype.Component;

@Component
public class StartupApplicationListener implements ApplicationListener<ContextRefreshedEvent> {

    public static LocalDateTime startTime;

    @Override
    public void onApplicationEvent(ContextRefreshedEvent event) {
        startTime = LocalDateTime.now();
    }
}
