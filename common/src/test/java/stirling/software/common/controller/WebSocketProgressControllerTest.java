package stirling.software.common.controller;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import stirling.software.common.model.job.JobProgress;

class WebSocketProgressControllerTest {

    @Mock
    private SimpMessagingTemplate messagingTemplate;
    
    @InjectMocks
    private WebSocketProgressController controller;
    
    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
    }
    
    @Test
    void testSendProgress_WithMessagingTemplate() {
        // Arrange
        String jobId = "test-job-id";
        JobProgress progress = new JobProgress(jobId, "In Progress", 50, "Processing");
        
        // Act
        controller.sendProgress(jobId, progress);
        
        // Assert
        verify(messagingTemplate).convertAndSend("/topic/progress/" + jobId, progress);
    }
    
    @Test
    void testSendProgress_WithNullMessagingTemplate() {
        // Arrange
        WebSocketProgressController controllerWithNullTemplate = new WebSocketProgressController();
        String jobId = "test-job-id";
        JobProgress progress = new JobProgress(jobId, "In Progress", 50, "Processing");
        
        // Act - should not throw exception even with null template
        controllerWithNullTemplate.sendProgress(jobId, progress);
        
        // No assertion needed - test passes if no exception is thrown
    }
    
    @Test
    void testSetMessagingTemplate() {
        // Arrange
        WebSocketProgressController newController = new WebSocketProgressController();
        SimpMessagingTemplate newTemplate = mock(SimpMessagingTemplate.class);
        
        // Act
        newController.setMessagingTemplate(newTemplate);
        String jobId = "test-job-id";
        JobProgress progress = new JobProgress(jobId, "In Progress", 50, "Processing");
        newController.sendProgress(jobId, progress);
        
        // Assert
        verify(newTemplate).convertAndSend("/topic/progress/" + jobId, progress);
    }
}