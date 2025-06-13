package stirling.software.proprietary.controller;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.proprietary.audit.AuditEventType;
import stirling.software.proprietary.audit.AuditLevel;
import stirling.software.proprietary.audit.Audited;
import stirling.software.proprietary.service.AuditService;

import java.util.HashMap;
import java.util.Map;

/**
 * Example controller showing how to use the audit service.
 * This is for demonstration purposes only and should be removed in production.
 */
@Slf4j
@RestController
@RequestMapping("/api/audit-demo")
@RequiredArgsConstructor
public class AuditExampleController {

    private final AuditService auditService;

    /**
     * Example using direct AuditService injection
     */
    @GetMapping("/manual/{id}")
    public String auditManually(@PathVariable String id) {
        // Create an example audit event manually
        auditService.audit("EXAMPLE_EVENT", Map.of(
            "id", id,
            "timestamp", System.currentTimeMillis(),
            "action", "view"
        ));
        
        return "Audit event created for ID: " + id;
    }
    
    /**
     * Example using @Audited annotation with basic level
     */
    @Audited(type = AuditEventType.USER_PROFILE_UPDATE, level = AuditLevel.BASIC)
    @PostMapping("/users")
    public ResponseEntity<Map<String, Object>> createUser(@RequestBody Map<String, Object> user) {
        // This method is automatically audited with the USER_REGISTRATION type at BASIC level
        
        Map<String, Object> result = new HashMap<>();
        result.put("id", "user123");
        result.put("username", user.get("username"));
        result.put("created", true);
        
        return ResponseEntity.ok(result);
    }
    
    /**
     * Example using @Audited annotation with file upload at VERBOSE level
     */
    @Audited(type = AuditEventType.FILE_DOWNLOAD, level = AuditLevel.VERBOSE, includeResult = true)
    @PostMapping("/files/process")
    public ResponseEntity<Map<String, Object>> processFile(MultipartFile file) {
        // This method is automatically audited at VERBOSE level
        // The audit event will include information about the file
        // And will also include the result because includeResult=true
        
        Map<String, Object> result = new HashMap<>();
        result.put("filename", file != null ? file.getOriginalFilename() : "null");
        result.put("size", file != null ? file.getSize() : 0);
        result.put("status", "processed");
        
        return ResponseEntity.ok(result);
    }
    
    /**
     * Automatically audited controller method with GetMapping.
     * This method does NOT have an @Audited annotation but will still be
     * automatically audited by the ControllerAuditAspect.
     */
    @GetMapping("/users/{id}")
    public ResponseEntity<Map<String, Object>> getUser(@PathVariable String id) {
        // This method will be automatically audited by the ControllerAuditAspect
        // The audit will include the controller name, method name, and path
        
        Map<String, Object> result = new HashMap<>();
        result.put("id", id);
        result.put("username", "johndoe");
        result.put("email", "john.doe@example.com");
        
        return ResponseEntity.ok(result);
    }
    
    /**
     * Automatically audited controller method with PutMapping.
     */
    @PutMapping("/users/{id}")
    public ResponseEntity<Map<String, Object>> updateUser(
            @PathVariable String id, 
            @RequestBody Map<String, Object> user) {
        // This method will be automatically audited by the ControllerAuditAspect
        
        Map<String, Object> result = new HashMap<>();
        result.put("id", id);
        result.put("username", user.get("username"));
        result.put("updated", true);
        
        return ResponseEntity.ok(result);
    }
    
    /**
     * Automatically audited controller method with DeleteMapping.
     */
    @DeleteMapping("/users/{id}")
    public ResponseEntity<Map<String, Object>> deleteUser(@PathVariable String id) {
        // This method will be automatically audited by the ControllerAuditAspect
        
        Map<String, Object> result = new HashMap<>();
        result.put("id", id);
        result.put("deleted", true);
        
        return ResponseEntity.ok(result);
    }
}