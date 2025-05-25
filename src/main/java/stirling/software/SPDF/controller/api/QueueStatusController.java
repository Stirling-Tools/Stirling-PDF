package stirling.software.SPDF.controller.api;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.UnoServerManager;
import stirling.software.SPDF.config.UnoServerManager.ServerInstance;
import stirling.software.SPDF.utils.ConversionTask;
import stirling.software.SPDF.utils.ProcessExecutor;
import stirling.software.SPDF.utils.ProcessExecutor.Processes;

/** Controller for checking status of process queues */
@RestController
@RequestMapping("/api/v1/queue")
@Slf4j
public class QueueStatusController {

    @Autowired(required = false)
    private UnoServerManager unoServerManager;

    /**
     * Get the status of all process queues
     *
     * @return Map of queue statuses by process type
     */
    @GetMapping("/status")
    public ResponseEntity<Map<String, QueueStatus>> getAllQueueStatuses() {
        Map<String, QueueStatus> statuses = new HashMap<>();

        // Add statuses for all ProcessExecutor process types
        for (Processes processType : Processes.values()) {
            ProcessExecutor executor = ProcessExecutor.getInstance(processType);
            QueueStatus status = new QueueStatus();

            status.setProcessType(processType.name());
            status.setActiveCount(executor.getActiveTaskCount());
            status.setQueuedCount(executor.getQueueLength());

            statuses.put(processType.name(), status);
        }

        // Add UnoServer status if available
        if (unoServerManager != null) {
            QueueStatus status = new QueueStatus();
            status.setProcessType("UNOSERVER");

            // Get active tasks from UnoServerManager
            Map<String, ConversionTask> activeTasks = unoServerManager.getActiveTasks();
            status.setActiveCount(activeTasks.size());
            status.setQueuedCount(0); // UnoServer tasks are immediately processed

            statuses.put("UNOSERVER", status);
        }

        return ResponseEntity.ok(statuses);
    }

    /**
     * Get the status of a specific process queue
     *
     * @param processType The process type
     * @return Queue status for the specified process
     */
    @GetMapping("/status/{processType}")
    public ResponseEntity<QueueStatus> getQueueStatus(@PathVariable String processType) {
        try {
            Processes process = Processes.valueOf(processType.toUpperCase());
            ProcessExecutor executor = ProcessExecutor.getInstance(process);

            QueueStatus status = new QueueStatus();
            status.setProcessType(process.name());
            status.setActiveCount(executor.getActiveTaskCount());
            status.setQueuedCount(executor.getQueueLength());

            return ResponseEntity.ok(status);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    /**
     * Get status of a specific task
     *
     * @param taskId The task ID
     * @return Task status or 404 if not found
     */
    @GetMapping("/task/{taskId}")
    public ResponseEntity<TaskInfo> getTaskStatus(@PathVariable String taskId) {
        // Try to find the task in any process executor
        for (Processes processType : Processes.values()) {
            ProcessExecutor executor = ProcessExecutor.getInstance(processType);
            ConversionTask task = executor.getTask(taskId);

            if (task != null) {
                return ResponseEntity.ok(convertToTaskInfo(task));
            }
        }

        // Check UnoServer tasks if available
        if (unoServerManager != null && taskId.startsWith("office-")) {
            Map<String, ConversionTask> unoTasks = unoServerManager.getActiveTasks();
            ConversionTask task = unoTasks.get(taskId);

            if (task != null) {
                // Calculate queue position for UnoServer tasks
                if (task.getStatus() == ConversionTask.TaskStatus.QUEUED) {
                    int queuePosition = 0;
                    
                    for (ConversionTask otherTask : unoTasks.values()) {
                        if (otherTask.getStatus() == ConversionTask.TaskStatus.QUEUED 
                                && otherTask.getCreatedTime().isBefore(task.getCreatedTime())) {
                            queuePosition++;
                        }
                    }
                    
                    // Set queue position
                    task.setQueuePosition(queuePosition + 1);
                }
                
                return ResponseEntity.ok(convertToTaskInfo(task));
            }
        }

        return ResponseEntity.notFound().build();
    }
    
    /**
     * Get queue status for a specific client ID
     * 
     * @param clientId The client-generated ID for the task
     * @return Queue status with position for the specific client task
     */
    @GetMapping("/status/client/{clientId}")
    public ResponseEntity<Map<String, QueueStatus>> getQueueStatusForClient(@PathVariable String clientId) {
        Map<String, QueueStatus> result = new HashMap<>();
        boolean foundMatch = false;
        
        // Check each process type for the client ID
        for (Processes processType : Processes.values()) {
            ProcessExecutor executor = ProcessExecutor.getInstance(processType);
            List<ConversionTask> queuedTasks = executor.getQueuedTasks();
            
            // Find the position of the client's task in this queue
            for (ConversionTask task : queuedTasks) {
                // If we find a match for this client's task
                if (task.getId().equals(clientId)) {
                    QueueStatus status = new QueueStatus();
                    status.setProcessType(processType.name());
                    status.setActiveCount(executor.getActiveTaskCount());
                    status.setQueuedCount(task.getQueuePosition());
                    result.put(processType.name(), status);
                    foundMatch = true;
                    break; // Exit loop once found - we only need one match
                }
            }
            
            if (foundMatch) break; // Exit process type loop if we've found the task
        }
        
        // If no matching task found in process executors, check UnoServer
        if (!foundMatch && unoServerManager != null) {
            Map<String, ConversionTask> unoTasks = unoServerManager.getActiveTasks();
            ConversionTask task = unoTasks.get(clientId);
            
            if (task != null) {
                QueueStatus status = new QueueStatus();
                status.setProcessType("UNOSERVER");
                status.setActiveCount(unoTasks.size());
                status.setQueuedCount(0); // UnoServer tasks are immediately processed
                result.put("UNOSERVER", status);
            }
        }
        
        return ResponseEntity.ok(result);
    }

    /** Convert a ConversionTask to TaskInfo DTO */
    private TaskInfo convertToTaskInfo(ConversionTask task) {
        TaskInfo info = new TaskInfo();
        info.setId(task.getId());
        info.setStatus(task.getStatus().name());
        info.setQueuePosition(task.getQueuePosition());
        return info;
    }

    /** DTO for queue status */
    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class QueueStatus {
        private String processType;
        private int activeCount;
        private int queuedCount;
    }

    /** DTO for task information */
    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class TaskInfo {
        private String id;
        private String status;
        private int queuePosition;
    }
}