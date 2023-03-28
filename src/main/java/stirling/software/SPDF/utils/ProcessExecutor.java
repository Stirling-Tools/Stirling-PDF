package stirling.software.SPDF.utils;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.HashMap;
import java.util.concurrent.Semaphore;
public class ProcessExecutor {
	
	public enum Processes {
        LIBRE_OFFICE,
        OCR_MY_PDF
    }

    private static final Map<Processes, ProcessExecutor> instances = new HashMap<>();

    private final Semaphore semaphore;

    private ProcessExecutor(int semaphoreLimit) {
        this.semaphore = new Semaphore(semaphoreLimit);
    }

    public static ProcessExecutor getInstance(Processes processType) {
        return instances.computeIfAbsent(processType, key -> {
            int semaphoreLimit = switch (key) {
                case LIBRE_OFFICE -> 2; 
                case OCR_MY_PDF -> 2; 
            };
            return new ProcessExecutor(semaphoreLimit);
        });
    }
    
	public int runCommandWithOutputHandling(List<String> command) throws IOException, InterruptedException {
		int exitCode = 1;
		semaphore.acquire();
		try {
			
		
		    ProcessBuilder processBuilder = new ProcessBuilder(command);
		    Process process = processBuilder.start();
	
		    // Read the error stream and standard output stream concurrently
		    List<String> errorLines = new ArrayList<>();
		    List<String> outputLines = new ArrayList<>();
	
		    Thread errorReaderThread = new Thread(() -> {
		        try (BufferedReader errorReader = new BufferedReader(new InputStreamReader(process.getErrorStream(), StandardCharsets.UTF_8))) {
		            String line;
		            while ((line = errorReader.readLine()) != null) {
		                errorLines.add(line);
		            }
		        } catch (IOException e) {
		            e.printStackTrace();
		        }
		    });
	
		    Thread outputReaderThread = new Thread(() -> {
		        try (BufferedReader outputReader = new BufferedReader(new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
		            String line;
		            while ((line = outputReader.readLine()) != null) {
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
		        System.out.println("Command output:\n" + outputMessage);
		    }
	
		    if (errorLines.size() > 0) {
		        String errorMessage = String.join("\n", errorLines);
		        System.out.println("Command error output:\n" + errorMessage);
		        if (exitCode != 0) {
		            throw new IOException("Command process failed with exit code " + exitCode + ". Error message: " + errorMessage);
		        }
		    }
		} finally {
			semaphore.release();
		}
	    return exitCode;
	}
   		
	    		
}
