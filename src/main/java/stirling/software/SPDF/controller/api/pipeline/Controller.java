package stirling.software.SPDF.controller.api.pipeline;

import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.*;
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

import stirling.software.SPDF.utils.WebResponseUtils;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.*;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.io.*;
import java.util.*;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;


@RestController
public class Controller {

	@PostMapping("/handleData")
	public ResponseEntity<byte[]> handleData(@RequestPart("fileInput") MultipartFile[] files,
			@RequestParam("json") String jsonString) {
		try {
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
