package stirling.software.SPDF.config;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;
import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.utils.ProcessExecutor;
import stirling.software.SPDF.utils.ProcessExecutor.ProcessExecutorResult;

@Component
public class PostStartupProcesses {

    @Autowired ApplicationProperties applicationProperties;

    @Autowired
    @Qualifier("RunningInDocker")
    private boolean runningInDocker;

    @Autowired
    @Qualifier("bookFormatsInstalled")
    private boolean bookFormatsInstalled;

    @Autowired
    @Qualifier("htmlFormatsInstalled")
    private boolean htmlFormatsInstalled;

    private static final Logger logger = LoggerFactory.getLogger(PostStartupProcesses.class);

    @PostConstruct
    public void runInstallCommandBasedOnEnvironment() throws IOException, InterruptedException {
        List<List<String>> commands = new ArrayList<>();
        // Checking for DOCKER_INSTALL_BOOK_FORMATS environment variable
        if (bookFormatsInstalled) {
            List<String> tmpList = new ArrayList<>();

            tmpList = new ArrayList<>();
            tmpList.addAll(Arrays.asList("whoami"));
            commands.add(tmpList);

            tmpList = new ArrayList<>();
            tmpList.addAll(Arrays.asList("id"));
            commands.add(tmpList);
        }

        if (!commands.isEmpty()) {
            // Run the command
            if (runningInDocker) {
                List<String> tmpList = new ArrayList<>();

                for (List<String> list : commands) {
                    ProcessExecutorResult returnCode =
                            ProcessExecutor.getInstance(ProcessExecutor.Processes.INSTALL_APP, true)
                                    .runCommandWithOutputHandling(list);
                    logger.info("RC for app installs {}", returnCode.getRc());
                }
            } else {

                logger.info(
                        "Not running inside Docker so skipping automated install process with command.");
            }

        } else {
            if (runningInDocker) {
                logger.info("No custom apps to install.");
            }
        }
    }
}
