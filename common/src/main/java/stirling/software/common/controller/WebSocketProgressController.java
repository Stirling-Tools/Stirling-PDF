package stirling.software.common.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

import lombok.NoArgsConstructor;

import stirling.software.common.model.job.JobProgress;

@Controller
@NoArgsConstructor
public class WebSocketProgressController {

    private SimpMessagingTemplate messagingTemplate;

    @Autowired(required = false)
    public void setMessagingTemplate(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

    public void sendProgress(String jobId, JobProgress progress) {
        if (messagingTemplate != null) {
            messagingTemplate.convertAndSend("/topic/progress/" + jobId, progress);
        }
    }
}
