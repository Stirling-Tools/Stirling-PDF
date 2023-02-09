package stirling.software.SPDF.controller.security;

import java.io.IOException;
import java.util.Map;
import java.util.Map.Entry;

import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;

@Controller
public class MetadataController {

	@GetMapping("/change-metadata")
	public String addWatermarkForm(Model model) {
		model.addAttribute("currentPage", "change-metadata");
		return "security/change-metadata";
	}

	@PostMapping("/update-metadata")
	public ResponseEntity<byte[]> metadata(@RequestParam Map<String, String> allRequestParams) throws IOException {

		System.out.println("1 allRequestParams.size() = " + allRequestParams.size());
		for (Entry entry : allRequestParams.entrySet()) {
			System.out.println("1 key=" + entry.getKey() + ", value=" + entry.getValue());
		}
		return null;
	}

//	@PostMapping("/update-metadata")
//	public ResponseEntity<byte[]> addWatermark(@RequestParam("fileInput") MultipartFile pdfFile,
//			@RequestParam Map<String,String> allRequestParams,HttpServletRequest request, ModelMap model) throws IOException {
//	  // Load the PDF file
//		System.out.println("1 allRequestParams.size() = " + allRequestParams.size());
//	  for(Entry entry : allRequestParams.entrySet()) {
//		  System.out.println("1 key=" + entry.getKey() + ", value=" + entry.getValue());
//	  }
//
//
//	  System.out.println("request.getParameterMap().size() = " + request.getParameterMap().size());
//	  for(Entry entry : request.getParameterMap().entrySet()) {
//		  System.out.println("2 key=" + entry.getKey() + ", value=" + entry.getValue());
//	  }
//
//
//	  System.out.println("mdoel.size() = " + model.size());
//	  for(Entry entry :  model.entrySet()) {
//		  System.out.println("3 key=" + entry.getKey() + ", value=" + entry.getValue());
//	  }
//
//	  PDDocument document = PDDocument.load(pdfFile.getBytes());
//
//
//	  // Remove all metadata based on flag
//	  PDDocumentInformation info = document.getDocumentInformation();
//	  for (String key : info.getMetadataKeys()) {
//	    info.setCustomMetadataValue(key, null);
//	  }
//
//
//
//
//	  return PdfUtils.pdfDocToWebResponse(document, pdfFile.getName() + "_metadata.pdf");
//	}

//	  // Loop over all pages and remove annotations
//	  for (PDPage page : document.getPages()) {
//	    page.getAnnotations().clear();
//	  }
}
