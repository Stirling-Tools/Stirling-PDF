package stirling.software.SPDF.controller.api.pipeline;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.PrintStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Map.Entry;
import java.util.stream.Collectors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.multipart.MultipartFile;

import jakarta.servlet.ServletContext;
import stirling.software.SPDF.SPdfApplication;
import stirling.software.SPDF.model.PipelineConfig;
import stirling.software.SPDF.model.PipelineOperation;
import stirling.software.SPDF.model.Role;

@Service
public class PipelineProcessor {

    private static final Logger logger = LoggerFactory.getLogger(PipelineProcessor.class);

    @Autowired private ApiDocService apiDocService;

    @Autowired(required = false)
    private UserServiceInterface userService;

    @Autowired private ServletContext servletContext;

    private String getApiKeyForUser() {
        if (userService == null) return "";
        return userService.getApiKeyForUser(Role.INTERNAL_API_USER.getRoleId());
    }

    private String getBaseUrl() {
        String contextPath = servletContext.getContextPath();
        String port = SPdfApplication.getPort();

        return "http://localhost:" + port + contextPath + "/";
    }

    List<Resource> runPipelineAgainstFiles(List<Resource> outputFiles, PipelineConfig config)
            throws Exception {

        ByteArrayOutputStream logStream = new ByteArrayOutputStream();
        PrintStream logPrintStream = new PrintStream(logStream);

        boolean hasErrors = false;

        for (PipelineOperation pipelineOperation : config.getOperations()) {
            String operation = pipelineOperation.getOperation();
            boolean isMultiInputOperation = apiDocService.isMultiInput(operation);

            logger.info(
                    "Running operation: {} isMultiInputOperation {}",
                    operation,
                    isMultiInputOperation);
            Map<String, Object> parameters = pipelineOperation.getParameters();
            String inputFileExtension = "";

            // TODO
            // if (operationNode.has("inputFileType")) {
            //	inputFileExtension = operationNode.get("inputFileType").asText();
            // } else {
            inputFileExtension = ".pdf";
            // }
            final String finalInputFileExtension = inputFileExtension;

            String url = getBaseUrl() + operation;

            List<Resource> newOutputFiles = new ArrayList<>();
            if (!isMultiInputOperation) {
                for (Resource file : outputFiles) {
                    boolean hasInputFileType = false;
                    if (file.getFilename().endsWith(inputFileExtension)) {
                        hasInputFileType = true;
                        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
                        body.add("fileInput", file);

                        for (Entry<String, Object> entry : parameters.entrySet()) {
                            body.add(entry.getKey(), entry.getValue());
                        }

                        ResponseEntity<byte[]> response = sendWebRequest(url, body);

                        // If the operation is filter and the response body is null or empty, skip
                        // this
                        // file
                        if (operation.startsWith("filter-")
                                && (response.getBody() == null || response.getBody().length == 0)) {
                            logger.info("Skipping file due to failing {}", operation);
                            continue;
                        }

                        if (!response.getStatusCode().equals(HttpStatus.OK)) {
                            logPrintStream.println("Error: " + response.getBody());
                            hasErrors = true;
                            continue;
                        }
                        processOutputFiles(operation, file.getFilename(), response, newOutputFiles);
                    }

                    if (!hasInputFileType) {
                        logPrintStream.println(
                                "No files with extension "
                                        + inputFileExtension
                                        + " found for operation "
                                        + operation);
                        hasErrors = true;
                    }
                }

            } else {
                // Filter and collect all files that match the inputFileExtension
                List<Resource> matchingFiles =
                        outputFiles.stream()
                                .filter(
                                        file ->
                                                file.getFilename()
                                                        .endsWith(finalInputFileExtension))
                                .collect(Collectors.toList());

                // Check if there are matching files
                if (!matchingFiles.isEmpty()) {
                    // Create a new MultiValueMap for the request body
                    MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();

                    // Add all matching files to the body
                    for (Resource file : matchingFiles) {
                        body.add("fileInput", file);
                    }

                    for (Entry<String, Object> entry : parameters.entrySet()) {
                        body.add(entry.getKey(), entry.getValue());
                    }

                    ResponseEntity<byte[]> response = sendWebRequest(url, body);

                    // Handle the response
                    if (response.getStatusCode().equals(HttpStatus.OK)) {
                        processOutputFiles(
                                operation,
                                matchingFiles.get(0).getFilename(),
                                response,
                                newOutputFiles);
                    } else {
                        // Log error if the response status is not OK
                        logPrintStream.println(
                                "Error in multi-input operation: " + response.getBody());
                        hasErrors = true;
                    }
                } else {
                    logPrintStream.println(
                            "No files with extension "
                                    + inputFileExtension
                                    + " found for multi-input operation "
                                    + operation);
                    hasErrors = true;
                }
            }
            logPrintStream.close();
            outputFiles = newOutputFiles;
        }
        if (hasErrors) {
            logger.error("Errors occurred during processing. Log: {}", logStream.toString());
        }

        return outputFiles;
    }

    private ResponseEntity<byte[]> sendWebRequest(String url, MultiValueMap<String, Object> body) {
        RestTemplate restTemplate = new RestTemplate();

        // Set up headers, including API key

        HttpHeaders headers = new HttpHeaders();
        String apiKey = getApiKeyForUser();
        headers.add("X-API-Key", apiKey);
        headers.setContentType(MediaType.MULTIPART_FORM_DATA);

        // Create HttpEntity with the body and headers
        HttpEntity<MultiValueMap<String, Object>> entity = new HttpEntity<>(body, headers);

        // Make the request to the REST endpoint
        return restTemplate.exchange(url, HttpMethod.POST, entity, byte[].class);
    }

    private List<Resource> processOutputFiles(
            String operation,
            String fileName,
            ResponseEntity<byte[]> response,
            List<Resource> newOutputFiles)
            throws IOException {
        // Define filename
        String newFilename;
        if ("auto-rename".equals(operation)) {
            // If the operation is "auto-rename", generate a new filename.
            // This is a simple example of generating a filename using current timestamp.
            // Modify as per your needs.
            newFilename = "file_" + System.currentTimeMillis();
        } else {
            // Otherwise, keep the original filename.
            newFilename = fileName;
        }

        // Check if the response body is a zip file
        if (isZip(response.getBody())) {
            // Unzip the file and add all the files to the new output files
            newOutputFiles.addAll(unzip(response.getBody()));
        } else {
            Resource outputResource =
                    new ByteArrayResource(response.getBody()) {
                        @Override
                        public String getFilename() {
                            return newFilename;
                        }
                    };
            newOutputFiles.add(outputResource);
        }

        return newOutputFiles;
    }

    List<Resource> generateInputFiles(File[] files) throws Exception {
        if (files == null || files.length == 0) {
            logger.info("No files");
            return null;
        }

        List<Resource> outputFiles = new ArrayList<>();

        for (File file : files) {
            Path path = Paths.get(file.getAbsolutePath());
            logger.info("Reading file: " + path); // debug statement

            if (Files.exists(path)) {
                Resource fileResource =
                        new ByteArrayResource(Files.readAllBytes(path)) {
                            @Override
                            public String getFilename() {
                                return file.getName();
                            }
                        };
                outputFiles.add(fileResource);
            } else {
                logger.info("File not found: " + path);
            }
        }
        logger.info("Files successfully loaded. Starting processing...");
        return outputFiles;
    }

    List<Resource> generateInputFiles(MultipartFile[] files) throws Exception {
        if (files == null || files.length == 0) {
            logger.info("No files");
            return null;
        }

        List<Resource> outputFiles = new ArrayList<>();

        for (MultipartFile file : files) {
            Resource fileResource =
                    new ByteArrayResource(file.getBytes()) {
                        @Override
                        public String getFilename() {
                            return file.getOriginalFilename();
                        }
                    };
            outputFiles.add(fileResource);
        }
        logger.info("Files successfully loaded. Starting processing...");
        return outputFiles;
    }

    private boolean isZip(byte[] data) {
        if (data == null || data.length < 4) {
            return false;
        }

        // Check the first four bytes of the data against the standard zip magic number
        return data[0] == 0x50 && data[1] == 0x4B && data[2] == 0x03 && data[3] == 0x04;
    }

    private List<Resource> unzip(byte[] data) throws IOException {
        logger.info("Unzipping data of length: {}", data.length);
        List<Resource> unzippedFiles = new ArrayList<>();

        try (ByteArrayInputStream bais = new ByteArrayInputStream(data);
                ZipInputStream zis = new ZipInputStream(bais)) {

            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                byte[] buffer = new byte[1024];
                int count;

                while ((count = zis.read(buffer)) != -1) {
                    baos.write(buffer, 0, count);
                }

                final String filename = entry.getName();
                Resource fileResource =
                        new ByteArrayResource(baos.toByteArray()) {
                            @Override
                            public String getFilename() {
                                return filename;
                            }
                        };

                // If the unzipped file is a zip file, unzip it
                if (isZip(baos.toByteArray())) {
                    logger.info("File {} is a zip file. Unzipping...", filename);
                    unzippedFiles.addAll(unzip(baos.toByteArray()));
                } else {
                    unzippedFiles.add(fileResource);
                }
            }
        }

        logger.info("Unzipping completed. {} files were unzipped.", unzippedFiles.size());
        return unzippedFiles;
    }
}
