package stirling.software.SPDF.utils;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
public class ProcessExecutorTest {

    @Test
    public void testProcessExecutorResult() {
        // Test the ProcessExecutorResult class
        ProcessExecutor.ProcessExecutorResult result =
                new ProcessExecutor().new ProcessExecutorResult(0, "Success message", "task-123");

        assertEquals(0, result.getRc(), "Exit code should be 0");
        assertEquals("Success message", result.getMessages(), "Messages should match");
        assertEquals("task-123", result.getTaskId(), "Task ID should match");

        // Test constructor without taskId
        ProcessExecutor.ProcessExecutorResult resultNoTask =
                new ProcessExecutor().new ProcessExecutorResult(1, "Error message");

        assertEquals(1, resultNoTask.getRc(), "Exit code should be 1");
        assertEquals("Error message", resultNoTask.getMessages(), "Messages should match");
        assertTrue(resultNoTask.getTaskId() == null, "Task ID should be null");
    }
}
