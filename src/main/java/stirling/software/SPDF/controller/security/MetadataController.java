package stirling.software.SPDF.controller.security;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.io.IOException;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDMetadata;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.graphics.state.PDExtendedGraphicsState;
import org.apache.pdfbox.util.Matrix;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.SPDF.utils.PdfUtils;

@Controller
public class MetadataController {

	@GetMapping("/change-metadata")
	public String addWatermarkForm(Model model) {
		model.addAttribute("currentPage", "change-metadata");
		return "security/change-metadata";
	}

	@PostMapping("/update-metadata")
	public ResponseEntity<byte[]> addWatermark(@RequestParam("pdfFile") MultipartFile pdfFile,
			@RequestParam("author") String author) throws IOException {
	  // Load the PDF file
	  PDDocument document = PDDocument.load(pdfFile.getBytes());

	  
	  // Remove all metadata based on flag
	  PDDocumentInformation info = document.getDocumentInformation();
	  for (String key : info.getMetadataKeys()) {
	    info.setCustomMetadataValue(key, null);
	  }

	  
	

	  return PdfUtils.pdfDocToWebResponse(document, pdfFile.getName() + "_metadata.pdf");
	}

	
//	  // Loop over all pages and remove annotations
//	  for (PDPage page : document.getPages()) {
//	    page.getAnnotations().clear();
//	  }
}
