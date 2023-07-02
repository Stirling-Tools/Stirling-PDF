package stirling.software.SPDF.controller.api.pipeline;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.PrintStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.multipart.MultipartFile;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import io.swagger.v3.oas.annotations.tags.Tag;
import stirling.software.SPDF.model.PipelineConfig;
import stirling.software.SPDF.model.PipelineOperation;
import stirling.software.SPDF.utils.WebResponseUtils;


@RestController
@Tag(name = "Pipeline", description = "Pipeline APIs")
public class Controller {

	@Autowired
	private ObjectMapper objectMapper;
	
	
	final String jsonFileName = "pipelineCofig.json";
	final String watchedFoldersDir = "watchedFolders/";
	@Scheduled(fixedRate = 5000)
	public void scanFolders() {
		Path watchedFolderPath = Paths.get(watchedFoldersDir);
	    if (!Files.exists(watchedFolderPath)) {
	        try {
	            Files.createDirectories(watchedFolderPath);
	        } catch (IOException e) {
	            e.printStackTrace();
	            return;
	        }
	    }
	    
		try (Stream<Path> paths = Files.walk(watchedFolderPath)) {
	        paths.filter(Files::isDirectory).forEach(t -> {
				try {
					if (!t.equals(watchedFolderPath) && !t.endsWith("processing")) {
						handleDirectory(t);
					}
				} catch (Exception e) {
					e.printStackTrace();
				}
			});
	    } catch (Exception e) {
	        e.printStackTrace();
	    }
	}
	
	private void handleDirectory(Path dir) throws Exception {
	    Path jsonFile = dir.resolve(jsonFileName);
	    Path processingDir = dir.resolve("processing"); // Directory to move files during processing
	    if (!Files.exists(processingDir)) {
	        Files.createDirectory(processingDir);
	    }

	    if (Files.exists(jsonFile)) {
	        // Read JSON file
	        String jsonString;
	        try {
	            jsonString = new String(Files.readAllBytes(jsonFile));
	        } catch (IOException e) {
	            e.printStackTrace();
	            return;
	        }

	        // Decode JSON to PipelineConfig
	        PipelineConfig config;
	        try {
	            config = objectMapper.readValue(jsonString, PipelineConfig.class);
	            // Assuming your PipelineConfig class has getters for all necessary fields, you can perform checks here
	            if (config.getOperations() == null || config.getOutputDir() == null || config.getName() == null) {
	                throw new IOException("Invalid JSON format");
	            }
	        } catch (IOException e) {
	            e.printStackTrace();
	            return;
	        }

	        // For each operation in the pipeline
	        for (PipelineOperation operation : config.getOperations()) {
	            // Collect all files based on fileInput
	            File[] files;
	            String fileInput = (String) operation.getParameters().get("fileInput");
	            if ("automated".equals(fileInput)) {
	                // If fileInput is "automated", process all files in the directory
	                try (Stream<Path> paths = Files.list(dir)) {
	                    files = paths.filter(path -> !path.equals(jsonFile))
	                            .map(Path::toFile)
	                            .toArray(File[]::new);
	                } catch (IOException e) {
	                    e.printStackTrace();
	                    return;
	                }
	            } else {
	                // If fileInput contains a path, process only this file
	                files = new File[]{new File(fileInput)};
	            }
	            
	            // Prepare the files for processing
	            File[] filesToProcess = files.clone();
	            for (File file : filesToProcess) {
	                Files.move(file.toPath(), processingDir.resolve(file.getName()));
	            }
	            
	            // Process the files
	            try {
	                List<Resource> resources = handleFiles(filesToProcess, jsonString);

	                // Move resultant files and rename them as per config in JSON file
	                for (Resource resource : resources) {
	                    String outputFileName = config.getOutputPattern().replace("{filename}", resource.getFile().getName());
	                    outputFileName = outputFileName.replace("{pipelineName}", config.getName());
	                    DateTimeFormatter dateFormatter = DateTimeFormatter.ofPattern("yyyyMMdd");
	                    outputFileName = outputFileName.replace("{date}", LocalDate.now().format(dateFormatter));
	                    DateTimeFormatter timeFormatter = DateTimeFormatter.ofPattern("HHmmss");
	                    outputFileName = outputFileName.replace("{time}", LocalTime.now().format(timeFormatter));
	                    // {filename} {folder} {date} {tmime} {pipeline}

	                    Files.move(resource.getFile().toPath(), Paths.get(config.getOutputDir(), outputFileName));
	                }
	                
	                // If successful, delete the original files
	                for (File file : filesToProcess) {
	                    Files.deleteIfExists(processingDir.resolve(file.getName()));
	                }
	            } catch (Exception e) {
	                // If an error occurs, move the original files back
	                for (File file : filesToProcess) {
	                    Files.move(processingDir.resolve(file.getName()), file.toPath());
	                }
	                throw e;
	            }
	        }
	    }
	}




List<Resource> processFiles(List<Resource> outputFiles, String jsonString) throws Exception{
	ObjectMapper mapper = new ObjectMapper();
	JsonNode jsonNode = mapper.readTree(jsonString);

	JsonNode pipelineNode = jsonNode.get("pipeline");
	ByteArrayOutputStream logStream = new ByteArrayOutputStream();
	PrintStream logPrintStream = new PrintStream(logStream);
	
	boolean hasErrors = false;

	for (JsonNode operationNode : pipelineNode) {
		String operation = operationNode.get("operation").asText();
		JsonNode parametersNode = operationNode.get("parameters");
		String inputFileExtension = "";
		if(operationNode.has("inputFileType")) {
		 inputFileExtension = operationNode.get("inputFileType").asText();
		} else {
			inputFileExtension=".pdf";
		}

		List<Resource> newOutputFiles = new ArrayList<>();
		boolean hasInputFileType = false;

		for (Resource file : outputFiles) {
			if (file.getFilename().endsWith(inputFileExtension)) {
				hasInputFileType = true;
				MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
				body.add("fileInput", file);

				Iterator<Map.Entry<String, JsonNode>> parameters = parametersNode.fields();
				while (parameters.hasNext()) {
					Map.Entry<String, JsonNode> parameter = parameters.next();
					body.add(parameter.getKey(), parameter.getValue().asText());
				}

				HttpHeaders headers = new HttpHeaders();
				headers.setContentType(MediaType.MULTIPART_FORM_DATA);

				HttpEntity<MultiValueMap<String, Object>> entity = new HttpEntity<>(body, headers);

				RestTemplate restTemplate = new RestTemplate();
				String url = "http://localhost:8080/" + operation;

				ResponseEntity<byte[]> response = restTemplate.exchange(url, HttpMethod.POST, entity, byte[].class);

				if (!response.getStatusCode().equals(HttpStatus.OK)) {
					logPrintStream.println("Error: " + response.getBody());
					hasErrors = true;
                    continue;
				}

				// Check if the response body is a zip file
				if (isZip(response.getBody())) {
					// Unzip the file and add all the files to the new output files
					newOutputFiles.addAll(unzip(response.getBody()));
				} else {
					Resource outputResource = new ByteArrayResource(response.getBody()) {
						@Override
						public String getFilename() {
							return file.getFilename(); // Preserving original filename
						}
					};
					newOutputFiles.add(outputResource);
				}
			}

			 if (!hasInputFileType) {
                logPrintStream.println("No files with extension " + inputFileExtension + " found for operation " + operation);
                hasErrors = true;
            }
			 
			outputFiles = newOutputFiles;
		}
		logPrintStream.close();
		
	}
	return outputFiles;
}
	

List<Resource> handleFiles(File[] files, String jsonString) throws Exception{
	ObjectMapper mapper = new ObjectMapper();
	JsonNode jsonNode = mapper.readTree(jsonString);

	JsonNode pipelineNode = jsonNode.get("pipeline");
	ByteArrayOutputStream logStream = new ByteArrayOutputStream();
	PrintStream logPrintStream = new PrintStream(logStream);
	
	boolean hasErrors = false;
	List<Resource> outputFiles = new ArrayList<>();

	for (File file : files) {
		Path path = Paths.get(file.getAbsolutePath());
        Resource fileResource = new ByteArrayResource(Files.readAllBytes(path)) {
            @Override
            public String getFilename() {
                return file.getName();
            }
        };
		outputFiles.add(fileResource);
	}
	return processFiles(outputFiles, jsonString);
}

	List<Resource> handleFiles(MultipartFile[] files, String jsonString) throws Exception{
		ObjectMapper mapper = new ObjectMapper();
		JsonNode jsonNode = mapper.readTree(jsonString);

		JsonNode pipelineNode = jsonNode.get("pipeline");
		ByteArrayOutputStream logStream = new ByteArrayOutputStream();
		PrintStream logPrintStream = new PrintStream(logStream);
		
		boolean hasErrors = false;
		List<Resource> outputFiles = new ArrayList<>();

		for (MultipartFile file : files) {
			Resource fileResource = new ByteArrayResource(file.getBytes()) {
				@Override
				public String getFilename() {
					return file.getOriginalFilename();
				}
			};
			outputFiles.add(fileResource);
		}
		return processFiles(outputFiles, jsonString);
	}
	
	@PostMapping("/handleData")
	public ResponseEntity<byte[]> handleData(@RequestPart("fileInput") MultipartFile[] files,
			@RequestParam("json") String jsonString) {
		try {
			
		List<Resource> outputFiles = handleFiles(files, jsonString);

		if (outputFiles.size() == 1) {
		    // If there is only one file, return it directly
		    Resource singleFile = outputFiles.get(0);
		    InputStream is = singleFile.getInputStream();
		    byte[] bytes = new byte[(int)singleFile.contentLength()];
		    is.read(bytes);
		    is.close();
		
		    return WebResponseUtils.bytesToWebResponse(bytes, singleFile.getFilename(), MediaType.APPLICATION_OCTET_STREAM);
		} 

			// Create a ByteArrayOutputStream to hold the zip
		    ByteArrayOutputStream baos = new ByteArrayOutputStream();
		    ZipOutputStream zipOut = new ZipOutputStream(baos);

		    // Loop through each file and add it to the zip
		    for (Resource file : outputFiles) {
		        ZipEntry zipEntry = new ZipEntry(file.getFilename());
		        zipOut.putNextEntry(zipEntry);

		        // Read the file into a byte array
		        InputStream is = file.getInputStream();
		        byte[] bytes = new byte[(int)file.contentLength()];
		        is.read(bytes);

		        // Write the bytes of the file to the zip
		        zipOut.write(bytes, 0, bytes.length);
		        zipOut.closeEntry();

		        is.close();
		    }

		    zipOut.close();
		    
			return WebResponseUtils.boasToWebResponse(baos, "output.zip", MediaType.APPLICATION_OCTET_STREAM);
		} catch (Exception e) {
			e.printStackTrace();
			return null;
		}
	}

	private boolean isZip(byte[] data) {
		if (data == null || data.length < 4) {
			return false;
		}

		// Check the first four bytes of the data against the standard zip magic number
		return data[0] == 0x50 && data[1] == 0x4B && data[2] == 0x03 && data[3] == 0x04;
	}

	private List<Resource> unzip(byte[] data) throws IOException {
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
				Resource fileResource = new ByteArrayResource(baos.toByteArray()) {
					@Override
					public String getFilename() {
						return filename;
					}
				};

				// If the unzipped file is a zip file, unzip it
				if (isZip(baos.toByteArray())) {
					unzippedFiles.addAll(unzip(baos.toByteArray()));
				} else {
					unzippedFiles.add(fileResource);
				}
			}
		}

		return unzippedFiles;
	}
}
