package stirling.software.SPDF.controller.web;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.HashMap;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;

import com.fasterxml.jackson.databind.ObjectMapper;

import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.tags.Tag;
@Controller
@Tag(name = "General", description = "General APIs")
public class GeneralWebController {
	
	@GetMapping("/pipeline")
	@Hidden
	public String pipelineForm(Model model) {
	    model.addAttribute("currentPage", "pipeline");

	    List<String> pipelineConfigs = new ArrayList<>();
	    try (Stream<Path> paths = Files.walk(Paths.get("./pipeline/defaultWebUIConfigs/"))) {
	        List<Path> jsonFiles = paths
	            .filter(Files::isRegularFile)
	            .filter(p -> p.toString().endsWith(".json"))
	            .collect(Collectors.toList());

	        for (Path jsonFile : jsonFiles) {
	            String content = Files.readString(jsonFile, StandardCharsets.UTF_8);
	            pipelineConfigs.add(content);
	        }
	        List<Map<String, String>> pipelineConfigsWithNames = new ArrayList<>();
	        for (String config : pipelineConfigs) {
	            Map<String, Object> jsonContent = new ObjectMapper().readValue(config, Map.class);
	            String name = (String) jsonContent.get("name");
	            Map<String, String> configWithName = new HashMap<>();
	            configWithName.put("json", config);
	            configWithName.put("name", name);
	            pipelineConfigsWithNames.add(configWithName);
	        }
	        model.addAttribute("pipelineConfigsWithNames", pipelineConfigsWithNames);

	    } catch (IOException e) {
	        e.printStackTrace();
	    }

	    model.addAttribute("pipelineConfigs", pipelineConfigs);

	    return "pipeline";
	}

	 
	 
	 
    @GetMapping("/merge-pdfs")
    @Hidden
    public String mergePdfForm(Model model) {
        model.addAttribute("currentPage", "merge-pdfs");
        return "merge-pdfs";
    }
    
    
    @GetMapping("/multi-tool")
    @Hidden
    public String multiToolForm(Model model) {
        model.addAttribute("currentPage", "multi-tool");
        return "multi-tool";
    }
   
    
    @GetMapping("/remove-pages")
    @Hidden
    public String pageDeleter(Model model) {
        model.addAttribute("currentPage", "remove-pages");
        return "remove-pages";
    }
    
    @GetMapping("/pdf-organizer")
    @Hidden
    public String pageOrganizer(Model model) {
        model.addAttribute("currentPage", "pdf-organizer");
        return "pdf-organizer";
    }
    
    @GetMapping("/rotate-pdf")
    @Hidden
    public String rotatePdfForm(Model model) {
        model.addAttribute("currentPage", "rotate-pdf");
        return "rotate-pdf";
    }
    
    @GetMapping("/split-pdfs")
    @Hidden
    public String splitPdfForm(Model model) {
        model.addAttribute("currentPage", "split-pdfs");
        return "split-pdfs";
    }
    
    @GetMapping("/sign")
    @Hidden
    public String signForm(Model model) {
        model.addAttribute("currentPage", "sign");
        model.addAttribute("fonts", getFontNames());
        return "sign";
    }
    private List<String> getFontNames() {
        try {
            return Files.list(Paths.get("src/main/resources/static/fonts"))
                    .map(Path::getFileName)
                    .map(Path::toString)
                    .filter(name -> name.endsWith(".woff2"))
                    .map(name -> name.substring(0, name.length() - 6)) // Remove .woff2 extension
                    .collect(Collectors.toList());
        } catch (IOException e) {
            throw new RuntimeException("Failed to read font directory", e);
        }
    }
    

    @GetMapping("/crop")
    @Hidden
    public String cropForm(Model model) {
        model.addAttribute("currentPage", "crop");
        return "crop";
    }
    

    @GetMapping("/auto-split-pdf")
    @Hidden
    public String autoSPlitPDFForm(Model model) {
        model.addAttribute("currentPage", "auto-split-pdf");
        return "auto-split-pdf";
    }
}
