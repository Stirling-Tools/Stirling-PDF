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
            // Set up the timezone configuration commands
            tmpList.addAll(
                    Arrays.asList(
                            "sh",
                            "-c",
                            "echo 'tzdata tzdata/Areas select Europe' | debconf-set-selections; "
                                    + "echo 'tzdata tzdata/Zones/Europe select Berlin' | debconf-set-selections"));
            commands.add(tmpList);

            // Install calibre with DEBIAN_FRONTEND set to noninteractive
            tmpList = new ArrayList<>();
            tmpList.addAll(
                    Arrays.asList(
                            "sh",
                            "-c",
                            "DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends calibre"));
            commands.add(tmpList);
        }

        // Checking for DOCKER_INSTALL_HTML_FORMATS environment variable
        if (htmlFormatsInstalled) {
            List<String> tmpList = new ArrayList<>();
            // Add -y flag for automatic yes to prompts and --no-install-recommends to reduce size
            tmpList.addAll(
                    Arrays.asList(
                            "apt-get", "install", "wkhtmltopdf", "-y", "--no-install-recommends"));
            commands.add(tmpList);
        }

        if (!commands.isEmpty()) {
            // Run the command
            if (runningInDocker) {
                List<String> tmpList = new ArrayList<>();
                tmpList.addAll(Arrays.asList("apt-get", "update"));
                commands.add(0, tmpList);

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
