package stirling.software.SPDF.utils;

import java.io.IOException;
import java.util.Arrays;
import java.util.List;

import stirling.software.SPDF.utils.ProcessExecutor.ProcessExecutorResult;

public class CheckProgramInstall {

    private static final List<String> PYTHON_COMMANDS = Arrays.asList("python3", "python");
    private static boolean pythonAvailableChecked = false;
    private static String availablePythonCommand = null;

    /**
     * Checks which Python command is available and returns it.
     *
     * @return The available Python command ("python3" or "python"), or null if neither is
     *     available.
     */
    public static String getAvailablePythonCommand() {
        if (!pythonAvailableChecked) {
            availablePythonCommand =
                    PYTHON_COMMANDS.stream()
                            .filter(CheckProgramInstall::checkPythonVersion)
                            .findFirst()
                            .orElse(null);
            pythonAvailableChecked = true;
        }
        return availablePythonCommand;
    }

    /**
     * Checks if the specified command is available by running the command with --version.
     *
     * @param pythonCommand The Python command to check.
     * @return true if the command is available, false otherwise.
     */
    private static boolean checkPythonVersion(String pythonCommand) {
        try {
            ProcessExecutorResult result =
                    ProcessExecutor.getInstance(ProcessExecutor.Processes.PYTHON_OPENCV)
                            .runCommandWithOutputHandling(
                                    Arrays.asList(pythonCommand, "--version"));
            return true; // Command succeeded, Python is available
        } catch (IOException | InterruptedException e) {
            return false; // Command failed, Python is not available
        }
    }

    /**
     * Checks if any Python command is available.
     *
     * @return true if any Python command is available, false otherwise.
     */
    public static boolean isPythonAvailable() {
        return getAvailablePythonCommand() != null;
    }
}
