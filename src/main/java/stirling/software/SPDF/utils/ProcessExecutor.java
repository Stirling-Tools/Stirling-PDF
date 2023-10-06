package stirling.software.SPDF.utils;

import io.github.pixee.security.BoundedLineReader;
import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Semaphore;

public class ProcessExecutor {

    public enum Processes {
        LIBRE_OFFICE, OCR_MY_PDF, PYTHON_OPENCV, GHOSTSCRIPT, WEASYPRINT
    }

    private static final Map<Processes, ProcessExecutor> instances = new ConcurrentHashMap<>();

    public static ProcessExecutor getInstance(Processes processType) {
        return instances.computeIfAbsent(processType, key -> {
            int semaphoreLimit = switch (key) {
            case LIBRE_OFFICE -> 1;
            case OCR_MY_PDF -> 2;
            case PYTHON_OPENCV -> 8;
            case GHOSTSCRIPT -> 16;
            case WEASYPRINT -> 16;
            };
            return new ProcessExecutor(semaphoreLimit);
        });
    }

    private final Semaphore semaphore;

    private ProcessExecutor(int semaphoreLimit) {
        this.semaphore = new Semaphore(semaphoreLimit);
    }
    public ProcessExecutorResult runCommandWithOutputHandling(List<String> command) throws IOException, InterruptedException {
    	return runCommandWithOutputHandling(command, null);
    }
    public ProcessExecutorResult runCommandWithOutputHandling(List<String> command, File workingDirectory) throws IOException, InterruptedException {
        int exitCode = 1;
        String messages = "";
        semaphore.acquire();
        try {

            System.out.print("Running command: " + String.join(" ", command));
            ProcessBuilder processBuilder = new ProcessBuilder(command);
            
            // Use the working directory if it's set
            if (workingDirectory != null) {
                processBuilder.directory(workingDirectory);
            }
            Process process = processBuilder.start();

            // Read the error stream and standard output stream concurrently
            List<String> errorLines = new ArrayList<>();
            List<String> outputLines = new ArrayList<>();

            Thread errorReaderThread = new Thread(() -> {
                try (BufferedReader errorReader = new BufferedReader(new InputStreamReader(process.getErrorStream(), StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = BoundedLineReader.readLine(errorReader, 5_000_000)) != null) {
                        errorLines.add(line);
                    }
                } catch (IOException e) {
                    e.printStackTrace();
                }
            });

            Thread outputReaderThread = new Thread(() -> {
                try (BufferedReader outputReader = new BufferedReader(new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = BoundedLineReader.readLine(outputReader, 5_000_000)) != null) {
                        outputLines.add(line);
                    }
                } catch (IOException e) {
                    e.printStackTrace();
                }
            });

            errorReaderThread.start();
            outputReaderThread.start();

            // Wait for the conversion process to complete
            exitCode = process.waitFor();

            // Wait for the reader threads to finish
            errorReaderThread.join();
            outputReaderThread.join();
           
            if (outputLines.size() > 0) {
                String outputMessage = String.join("\n", outputLines);
                messages += outputMessage;
                System.out.println("Command output:\n" + outputMessage);
            }

            if (errorLines.size() > 0) {
                String errorMessage = String.join("\n", errorLines);
                messages += errorMessage;
                System.out.println("Command error output:\n" + errorMessage);
                if (exitCode != 0) {
                    throw new IOException("Command process failed with exit code " + exitCode + ". Error message: " + errorMessage);
                }
            }
        } finally {
            semaphore.release();
        }
        return new ProcessExecutorResult(exitCode, messages);
    }
    public class ProcessExecutorResult{
    	int rc;
    	String messages;
    	public ProcessExecutorResult(int rc, String messages) {
    		this.rc = rc;
    		this.messages = messages;
    	}
		public int getRc() {
			return rc;
		}
		public void setRc(int rc) {
			this.rc = rc;
		}
		public String getMessages() {
			return messages;
		}
		public void setMessages(String messages) {
			this.messages = messages;
		}
    	
    	
    }
}
