package stirling.software.SPDF.controller.security;

import java.io.IOException;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Map;
import java.util.Map.Entry;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
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
    public ResponseEntity<byte[]> metadata(@RequestParam("fileInput") MultipartFile pdfFile,
            @RequestParam(value = "deleteAll", required = false, defaultValue = "false") Boolean deleteAll,
            @RequestParam(value = "author", required = false) String author,
            @RequestParam(value = "creationDate", required = false) String creationDate,
            @RequestParam(value = "creator", required = false) String creator,
            @RequestParam(value = "keywords", required = false) String keywords,
            @RequestParam(value = "modificationDate", required = false) String modificationDate,
            @RequestParam(value = "producer", required = false) String producer,
            @RequestParam(value = "subject", required = false) String subject,
            @RequestParam(value = "title", required = false) String title,
            @RequestParam(value = "trapped", required = false) String trapped,
            @RequestParam Map<String, String> allRequestParams) throws IOException {

        System.out.println("1 allRequestParams.size() = " + allRequestParams.size());
        for (Entry entry : allRequestParams.entrySet()) {
            System.out.println("1 key=" + entry.getKey() + ", value=" + entry.getValue());
        }
        
        PDDocument document = PDDocument.load(pdfFile.getBytes());
        
        // Remove all metadata based on flag
        PDDocumentInformation info = document.getDocumentInformation();
        
        if(deleteAll) { 
            for (String key : info.getMetadataKeys()) {
                info.setCustomMetadataValue(key, null);
              }
        } else {
        if(author != null && author.length() > 0) {
            info.setAuthor(author);
        }
        
        if(creationDate != null && creationDate.length() > 0) {
            Calendar creationDateCal = Calendar.getInstance();
            try {
                creationDateCal.setTime(new SimpleDateFormat("yyyy/MM/dd HH:mm:ss").parse(creationDate));
            } catch (ParseException e) {
                e.printStackTrace();
            }
            info.setCreationDate(creationDateCal);
        }
        if(creator != null && creator.length() > 0) {
            info.setCreator(creator);
        }
        if(keywords != null && keywords.length() > 0) {
            info.setKeywords(keywords);
        }
        if(modificationDate != null && modificationDate.length() > 0) {
            Calendar modificationDateCal = Calendar.getInstance();
            try {
                modificationDateCal.setTime(new SimpleDateFormat("yyyy/MM/dd HH:mm:ss").parse(modificationDate));
            } catch (ParseException e) {
                e.printStackTrace();
            }
            info.setModificationDate(modificationDateCal);
        }
        if(producer != null && producer.length() > 0) {
            info.setProducer(producer);
        }
        if(subject != null && subject.length() > 0) {
            info.setSubject(subject);
        }
        if(title != null && title.length() > 0) {
            info.setTitle(title);
        }
        if(trapped != null && trapped.length() > 0) {
            info.setTrapped(trapped);
        }
        }
        




        return PdfUtils.pdfDocToWebResponse(document, pdfFile.getName() + "_metadata.pdf");
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


//	  // Loop over all pages and remove annotations
//	  for (PDPage page : document.getPages()) {
//	    page.getAnnotations().clear();
//	  }
}
