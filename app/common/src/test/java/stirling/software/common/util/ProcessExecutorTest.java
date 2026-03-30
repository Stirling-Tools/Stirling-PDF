package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

class ProcessExecutorTest {

    // Use reflection to test private validateCommand method
    private void invokeValidateCommand(ProcessExecutor executor, List<String> command)
            throws Exception {
        Method method = ProcessExecutor.class.getDeclaredMethod("validateCommand", List.class);
        method.setAccessible(true);
        try {
            method.invoke(executor, command);
        } catch (java.lang.reflect.InvocationTargetException e) {
            throw (Exception) e.getCause();
        }
    }

    private ProcessExecutor getExecutor() {
        return ProcessExecutor.getInstance(ProcessExecutor.Processes.QPDF);
    }

    @Test
    void testValidateCommand_nullCommand() {
        assertThrows(
                IllegalArgumentException.class, () -> invokeValidateCommand(getExecutor(), null));
    }

    @Test
    void testValidateCommand_emptyCommand() {
        assertThrows(
                IllegalArgumentException.class,
                () -> invokeValidateCommand(getExecutor(), List.of()));
    }

    @Test
    void testValidateCommand_nullArgument() {
        List<String> command = new ArrayList<>();
        command.add("echo");
        command.add(null);
        assertThrows(
                IllegalArgumentException.class,
                () -> invokeValidateCommand(getExecutor(), command));
    }

    @Test
    void testValidateCommand_nullByteInArgument() {
        assertThrows(
                IllegalArgumentException.class,
                () -> invokeValidateCommand(getExecutor(), List.of("echo", "bad\0arg")));
    }

    @Test
    void testValidateCommand_newlineInArgument() {
        assertThrows(
                IllegalArgumentException.class,
                () -> invokeValidateCommand(getExecutor(), List.of("echo", "bad\narg")));
    }

    @Test
    void testValidateCommand_carriageReturnInArgument() {
        assertThrows(
                IllegalArgumentException.class,
                () -> invokeValidateCommand(getExecutor(), List.of("echo", "bad\rarg")));
    }

    @Test
    void testValidateCommand_pathTraversal() {
        assertThrows(
                IllegalArgumentException.class,
                () -> invokeValidateCommand(getExecutor(), List.of("../../bin/evil")));
    }

    @Test
    void testValidateCommand_blankExecutable() {
        assertThrows(
                IllegalArgumentException.class,
                () -> invokeValidateCommand(getExecutor(), List.of("  ")));
    }

    @Test
    void testValidateCommand_validSimpleCommand() throws Exception {
        // Simple command names (no path) should pass validation
        invokeValidateCommand(getExecutor(), List.of("echo", "hello"));
    }

    @Test
    void testGetInstance_returnsSameInstance() {
        ProcessExecutor e1 = ProcessExecutor.getInstance(ProcessExecutor.Processes.QPDF);
        ProcessExecutor e2 = ProcessExecutor.getInstance(ProcessExecutor.Processes.QPDF);
        assertSame(e1, e2);
    }

    @Test
    void testGetInstance_differentProcessTypes() {
        ProcessExecutor e1 = ProcessExecutor.getInstance(ProcessExecutor.Processes.QPDF);
        ProcessExecutor e2 = ProcessExecutor.getInstance(ProcessExecutor.Processes.TESSERACT);
        assertNotSame(e1, e2);
    }

    @Test
    void testProcessExecutorResult() {
        ProcessExecutor executor = getExecutor();
        ProcessExecutor.ProcessExecutorResult result =
                executor.new ProcessExecutorResult(0, "success");
        assertEquals(0, result.getRc());
        assertEquals("success", result.getMessages());

        result.setRc(1);
        result.setMessages("error");
        assertEquals(1, result.getRc());
        assertEquals("error", result.getMessages());
    }
}
