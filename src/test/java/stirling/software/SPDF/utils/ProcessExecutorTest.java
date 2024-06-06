package stirling.software.SPDF.utils;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

public class ProcessExecutorTest {

    private ProcessExecutor processExecutor;

    @BeforeEach
    public void setUp() {
        // Initialize the ProcessExecutor instance
        processExecutor = ProcessExecutor.getInstance(ProcessExecutor.Processes.LIBRE_OFFICE);
    }

    @Test
    public void testRunCommandWithOutputHandling() throws IOException, InterruptedException {
        // Mock the command to execute
        List<String> command = new ArrayList<>();
        command.add("java");
        command.add("-version");

        // Execute the command
        ProcessExecutor.ProcessExecutorResult result = processExecutor.runCommandWithOutputHandling(command);

        // Check the exit code and output messages
        assertEquals(0, result.getRc());
        assertNotNull(result.getMessages()); // Check if messages are not null
    }

    @Test
    public void testRunCommandWithOutputHandling_Error() {
        // Mock the command to execute
        List<String> command = new ArrayList<>();
        command.add("nonexistent-command");

        // Execute the command and expect an IOException
        IOException thrown = assertThrows(IOException.class, () -> {
            processExecutor.runCommandWithOutputHandling(command);
        });

        // Check the exception message to ensure it is about the nonexistent command
        assertTrue(thrown.getMessage().contains("CreateProcess error=2, The system cannot find the file specified"));
    }
}
