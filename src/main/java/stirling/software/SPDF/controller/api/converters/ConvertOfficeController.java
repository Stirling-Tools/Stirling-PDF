package stirling.software.SPDF.controller.api.converters;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import org.apache.commons.io.FilenameUtils;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.RuntimePathConfig;
import stirling.software.SPDF.config.UnoServerManager;
import stirling.software.SPDF.config.UnoServerManager.ServerInstance;
import stirling.software.SPDF.config.UnoServerManagerFallback;
import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.model.api.GeneralFile;
import stirling.software.SPDF.service.CustomPDFDocumentFactory;
import stirling.software.SPDF.utils.ConversionTask;
import stirling.software.SPDF.utils.ProcessExecutor;
import stirling.software.SPDF.utils.ProcessExecutor.ProcessExecutorResult;
import stirling.software.SPDF.utils.WebResponseUtils;

@Slf4j
@RestController
@Tag(name = "Convert", description = "Convert APIs")
@RequestMapping("/api/v1/convert")
public class ConvertOfficeController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final RuntimePathConfig runtimePathConfig;
    private final UnoServerManager unoServerManager;
    private final ApplicationProperties applicationProperties;

    @Autowired
    public ConvertOfficeController(
            CustomPDFDocumentFactory pdfDocumentFactory,
            RuntimePathConfig runtimePathConfig,
            ApplicationProperties applicationProperties,
            @Autowired(required = false) UnoServerManager unoServerManager,
            @Autowired(required = false)
                    UnoServerManagerFallback.UnoServerNotAvailableHandler
                            unoServerNotAvailableHandler) {
        this.pdfDocumentFactory = pdfDocumentFactory;
        this.runtimePathConfig = runtimePathConfig;
        this.unoServerManager = unoServerManager;
        this.applicationProperties = applicationProperties;

        // Log appropriate message based on UnoServer availability
        if (unoServerManager == null) {
            log.warn("UnoServer is not available. Office document conversions will be disabled.");
            if (unoServerNotAvailableHandler == null) {
                log.error("UnoServerNotAvailableHandler is also missing! This should not happen.");
            }
        } else {
            log.info("UnoServer is available. Office document conversions are enabled.");
        }
    }

    public File convertToPdf(MultipartFile inputFile) throws IOException, InterruptedException {
        return convertToPdf(inputFile, null);
    }

    public File convertToPdf(MultipartFile inputFile, String[] taskIdHolder)
            throws IOException, InterruptedException {
        // Check for valid file extension
        String originalFilename = Filenames.toSimpleFileName(inputFile.getOriginalFilename());
        if (originalFilename == null
                || !isValidFileExtension(FilenameUtils.getExtension(originalFilename))) {
            throw new IllegalArgumentException("Invalid file extension");
        }

        // Check if UnoServer is available
        if (unoServerManager == null) {
            throw new UnoServerManagerFallback.UnoServerNotAvailableException(
                    "UnoServer (LibreOffice) is not available. Office document conversions are disabled. "
                            + "To enable this feature, please install UnoServer or use the 'fat' Docker image variant.");
        }

        // Save the uploaded file to a temporary location
        Path tempInputFile =
                Files.createTempFile("input_", "." + FilenameUtils.getExtension(originalFilename));
        inputFile.transferTo(tempInputFile);

        // Prepare the output file path
        Path tempOutputFile = Files.createTempFile("output_", ".pdf");

        // Get the next available UnoServer instance
        ServerInstance serverInstance = unoServerManager.getNextInstance();

        // Create a task for tracking this conversion
        String taskName = "Convert " + originalFilename + " to PDF";
        String taskId = unoServerManager.createTask(taskName, serverInstance);

        // Store the task ID for the caller if requested
        if (taskIdHolder != null) {
            taskIdHolder[0] = taskId;
        }

        log.info(
                "Converting file {} using UnoServer instance at {}:{} (taskId: {})",
                originalFilename,
                serverInstance.getHost(),
                serverInstance.getPort(),
                taskId);

        long startTime = System.currentTimeMillis();

        try {
            // If it's a managed instance and not running, try to restart it
            if (!serverInstance.isRunning()) {
                log.warn(
                        "UnoServer instance at {}:{} is not running, attempting restart",
                        serverInstance.getHost(),
                        serverInstance.getPort());
                if (!serverInstance.restartIfNeeded()) {
                    unoServerManager.failTask(
                            taskId, serverInstance, "Failed to start UnoServer instance");
                    throw new IOException("Failed to start UnoServer instance for conversion");
                }
            }

            // Run the LibreOffice command with the selected server
            List<String> command =
                    new ArrayList<>(
                            Arrays.asList(
                                    runtimePathConfig.getUnoConvertPath(),
                                    "--port",
                                    String.valueOf(serverInstance.getPort()),
                                    "--host",
                                    serverInstance.getHost(),
                                    "--convert-to",
                                    "pdf",
                                    tempInputFile.toString(),
                                    tempOutputFile.toString()));

            log.debug("Running command: {}", String.join(" ", command));

            try {
                // Execute the command with a named task
                ProcessExecutorResult result =
                        ProcessExecutor.getInstance(ProcessExecutor.Processes.LIBRE_OFFICE)
                                .runCommandWithTask(command, "Convert " + originalFilename + " to PDF");

                // Calculate duration and mark task as complete
                long duration = System.currentTimeMillis() - startTime;
                unoServerManager.completeTask(taskId, serverInstance, duration);

                log.info(
                        "Successfully converted file {} using UnoServer instance {}:{} in {}ms (taskId: {})",
                        originalFilename,
                        serverInstance.getHost(),
                        serverInstance.getPort(),
                        duration,
                        taskId);

                // Read the converted PDF file
                return tempOutputFile.toFile();

            } catch (IOException | InterruptedException e) {
                // Mark task as failed
                unoServerManager.failTask(taskId, serverInstance, e.getMessage());

                log.error(
                        "Failed to convert file {} using UnoServer instance {}:{}: {}",
                        originalFilename,
                        serverInstance.getHost(),
                        serverInstance.getPort(),
                        e.getMessage());
                throw e;
            }

        } catch (Exception e) {
            // Mark task as failed if any other exception occurs
            unoServerManager.failTask(taskId, serverInstance, e.getMessage());
            throw e;
        } finally {
            // Clean up the temporary files
            if (tempInputFile != null) Files.deleteIfExists(tempInputFile);
        }
    }

    private boolean isValidFileExtension(String fileExtension) {
        String extensionPattern = "^(?i)[a-z0-9]{2,4}$";
        return fileExtension.matches(extensionPattern);
    }

    @PostMapping(consumes = "multipart/form-data", value = "/file/pdf")
    @Operation(
            summary = "Convert a file to a PDF using LibreOffice",
            description =
                    "This endpoint converts a given file to a PDF using LibreOffice API  Input:ANY"
                            + " Output:PDF Type:SISO")
    public ResponseEntity<byte[]> processFileToPDF(@ModelAttribute GeneralFile generalFile)
            throws Exception {
        // Check if UnoServer is available first to provide a friendly error message
        if (unoServerManager == null) {
            return WebResponseUtils.errorResponseWithMessage(
                    "UnoServer (LibreOffice) is not available. Office document conversions are disabled. "
                            + "To enable this feature, please install UnoServer or use the 'fat' Docker image variant.");
        }

        MultipartFile inputFile = generalFile.getFileInput();
        File file = null;
        String[] taskIdHolder = new String[1]; // Holder for task ID

        try {
            // Call the conversion method to do the actual conversion
            file = convertToPdf(inputFile, taskIdHolder);

            PDDocument doc = pdfDocumentFactory.load(file);
            
            // Get the ProcessExecutorResult to extract the task ID
            String processTaskId = null;
            if (file != null && file.exists()) {
                // Extract any ProcessExecutor task ID that might have been created
                // This is a bit of a hack but will work for demonstration
                ProcessExecutor processExecutor = ProcessExecutor.getInstance(ProcessExecutor.Processes.LIBRE_OFFICE);
                List<ConversionTask> activeTasks = processExecutor.getActiveTasks();
                List<ConversionTask> queuedTasks = processExecutor.getQueuedTasks();
                
                // Look for a task that matches our file name
                String filename = Filenames.toSimpleFileName(inputFile.getOriginalFilename());
                for (ConversionTask task : activeTasks) {
                    if (task.getTaskName().contains(filename)) {
                        processTaskId = task.getId();
                        break;
                    }
                }
                
                if (processTaskId == null) {
                    for (ConversionTask task : queuedTasks) {
                        if (task.getTaskName().contains(filename)) {
                            processTaskId = task.getId();
                            break;
                        }
                    }
                }
            }

            // Get the response builder from WebResponseUtils
            ResponseEntity.BodyBuilder responseBuilder =
                    WebResponseUtils.getResponseBuilder(
                            Filenames.toSimpleFileName(inputFile.getOriginalFilename())
                                            .replaceFirst("[.][^.]+$", "")
                                    + "_convertedToPDF.pdf");

            // Add headers for task tracking
            if (taskIdHolder[0] != null) {
                responseBuilder.header("X-Task-Id", taskIdHolder[0]);
            }
            
            if (processTaskId != null) {
                responseBuilder.header("X-Process-Task-Id", processTaskId);
            }
            
            // Return the response with all available headers
            return responseBuilder.body(WebResponseUtils.getBytesFromPDDocument(doc));

        } catch (UnoServerManagerFallback.UnoServerNotAvailableException e) {
            return WebResponseUtils.errorResponseWithMessage(e.getMessage());
        } finally {
            if (file != null) file.delete();
        }
    }
}
