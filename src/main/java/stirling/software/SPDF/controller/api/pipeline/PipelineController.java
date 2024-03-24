package stirling.software.SPDF.controller.api.pipeline;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonMappingException;
import com.fasterxml.jackson.databind.ObjectMapper;

import io.swagger.v3.oas.annotations.tags.Tag;

import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.model.PipelineConfig;
import stirling.software.SPDF.model.api.HandleDataRequest;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/pipeline")
@Tag(name = "Pipeline", description = "Pipeline APIs")
public class PipelineController {

    private static final Logger logger = LoggerFactory.getLogger(PipelineController.class);

    final String watchedFoldersDir = "./pipeline/watchedFolders/";
    final String finishedFoldersDir = "./pipeline/finishedFolders/";
    @Autowired PipelineProcessor processor;

    @Autowired ApplicationProperties applicationProperties;

    @Autowired private ObjectMapper objectMapper;

    @PostMapping("/handleData")
    public ResponseEntity<byte[]> handleData(@ModelAttribute HandleDataRequest request)
            throws JsonMappingException, JsonProcessingException {

        MultipartFile[] files = request.getFileInput();
        String jsonString = request.getJson();
        if (files == null) {
            return null;
        }
        PipelineConfig config = objectMapper.readValue(jsonString, PipelineConfig.class);
        logger.info("Received POST request to /handleData with {} files", files.length);
        try {
            List<Resource> inputFiles = processor.generateInputFiles(files);
            if (inputFiles == null || inputFiles.size() == 0) {
                return null;
            }
            List<Resource> outputFiles = processor.runPipelineAgainstFiles(inputFiles, config);
            if (outputFiles != null && outputFiles.size() == 1) {
                // If there is only one file, return it directly
                Resource singleFile = outputFiles.get(0);
                InputStream is = singleFile.getInputStream();
                byte[] bytes = new byte[(int) singleFile.contentLength()];
                is.read(bytes);
                is.close();

                logger.info("Returning single file response...");
                return WebResponseUtils.bytesToWebResponse(
                        bytes, singleFile.getFilename(), MediaType.APPLICATION_OCTET_STREAM);
            } else if (outputFiles == null) {
                return null;
            }

            // Create a ByteArrayOutputStream to hold the zip
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            ZipOutputStream zipOut = new ZipOutputStream(baos);

            // A map to keep track of filenames and their counts
            Map<String, Integer> filenameCount = new HashMap<>();

            // Loop through each file and add it to the zip
            for (Resource file : outputFiles) {
                String originalFilename = file.getFilename();
                String filename = originalFilename;

                // Check if the filename already exists, and modify it if necessary
                if (filenameCount.containsKey(originalFilename)) {
                    int count = filenameCount.get(originalFilename);
                    String baseName = originalFilename.replaceAll("\\.[^.]*$", "");
                    String extension = originalFilename.replaceAll("^.*\\.", "");
                    filename = baseName + "(" + count + ")." + extension;
                    filenameCount.put(originalFilename, count + 1);
                } else {
                    filenameCount.put(originalFilename, 1);
                }

                ZipEntry zipEntry = new ZipEntry(filename);
                zipOut.putNextEntry(zipEntry);

                // Read the file into a byte array
                InputStream is = file.getInputStream();
                byte[] bytes = new byte[(int) file.contentLength()];
                is.read(bytes);

                // Write the bytes of the file to the zip
                zipOut.write(bytes, 0, bytes.length);
                zipOut.closeEntry();

                is.close();
            }

            zipOut.close();

            logger.info("Returning zipped file response...");
            return WebResponseUtils.boasToWebResponse(
                    baos, "output.zip", MediaType.APPLICATION_OCTET_STREAM);
        } catch (Exception e) {
            logger.error("Error handling data: ", e);
            return null;
        }
    }
}
