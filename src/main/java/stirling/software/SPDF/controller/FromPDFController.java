package stirling.software.SPDF.controller;

import java.io.IOException;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.SPDF.utils.PdfUtils;

@Controller
public class FromPDFController {

	private static final Logger logger = LoggerFactory.getLogger(FromPDFController.class);

	@GetMapping("/convert-from-pdf")
	public String convertFromPdfForm() {
		return "convert-from-pdf";
	}

	@PostMapping("/convert-from-pdf")
	public ResponseEntity<byte[]> convertToImage(@RequestParam("fileInput") MultipartFile file,
			@RequestParam("imageFormat") String imageFormat) throws IOException {
		byte[] pdfBytes = file.getBytes();
		//returns bytes for image
		byte[] result =  PdfUtils.convertFromPdf(pdfBytes, imageFormat.toLowerCase());
		HttpHeaders headers = new HttpHeaders();
		headers.setContentType(MediaType.parseMediaType(getMediaType(imageFormat)));
		headers.setCacheControl("must-revalidate, post-check=0, pre-check=0");
		ResponseEntity<byte[]> response = new ResponseEntity<>(result, headers, HttpStatus.OK);
		return response;
	}

	private String getMediaType(String imageFormat) {
	    if(imageFormat.equalsIgnoreCase("PNG"))
	        return "image/png";
	    else if(imageFormat.equalsIgnoreCase("JPEG"))
	        return "image/jpeg";
	    else if(imageFormat.equalsIgnoreCase("GIF"))
	        return "image/gif";
	    else
	        return "application/octet-stream";
	}
}
