package stirling.software.SPDF.service.telegram;

import java.io.IOException;
import java.io.InputStream;
import java.net.MalformedURLException;
import java.net.URI;
import java.net.URL;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.attribute.FileTime;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Stream;

import org.apache.commons.io.FilenameUtils;
import org.apache.commons.lang3.StringUtils;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import org.telegram.telegrambots.bots.TelegramLongPollingBot;
import org.telegram.telegrambots.meta.TelegramBotsApi;
import org.telegram.telegrambots.meta.api.methods.GetFile;
import org.telegram.telegrambots.meta.api.methods.send.SendDocument;
import org.telegram.telegrambots.meta.api.methods.send.SendMessage;
import org.telegram.telegrambots.meta.api.objects.Chat;
import org.telegram.telegrambots.meta.api.objects.Document;
import org.telegram.telegrambots.meta.api.objects.File;
import org.telegram.telegrambots.meta.api.objects.InputFile;
import org.telegram.telegrambots.meta.api.objects.Message;
import org.telegram.telegrambots.meta.api.objects.Update;
import org.telegram.telegrambots.meta.api.objects.User;
import org.telegram.telegrambots.meta.exceptions.TelegramApiException;

import jakarta.annotation.PostConstruct;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.model.ApplicationProperties;

@Slf4j
@Component
@ConditionalOnProperty(prefix = "telegram", name = "enabled", havingValue = "true")
public class TelegramPipelineBot extends TelegramLongPollingBot {

    private final ApplicationProperties.Telegram telegramProperties;
    private final RuntimePathConfig runtimePathConfig;
    private final TelegramBotsApi telegramBotsApi;

    public TelegramPipelineBot(
            ApplicationProperties applicationProperties,
            RuntimePathConfig runtimePathConfig,
            TelegramBotsApi telegramBotsApi) {
        super(applicationProperties.getTelegram().getBotToken());
        this.telegramProperties = applicationProperties.getTelegram();
        this.runtimePathConfig = runtimePathConfig;
        this.telegramBotsApi = telegramBotsApi;
    }

    @PostConstruct
    public void register() {
        if (StringUtils.isAnyBlank(getBotUsername(), getBotToken())) {
            log.warn("Telegram bot disabled because botToken or botUsername is not configured");
            return;
        }
        try {
            telegramBotsApi.registerBot(this);
            log.info("Telegram pipeline bot registered as {}", getBotUsername());
        } catch (TelegramApiException e) {
            log.error("Failed to register Telegram bot", e);
        }
    }

    @Override
    public void onUpdateReceived(Update update) {
        Message message = null;

        // 1) Regular messages
        if (update.hasMessage()) {
            message = update.getMessage();
        }
        // 2) Channel posts
        else if (update.hasChannelPost()) {
            message = update.getChannelPost();
        } else {
            return;
        }

        Chat chat = message.getChat();
        if (chat == null) {
            return;
        }

        String chatType = chat.getType();
        if (!Objects.equals(chatType, "private")
                && !Objects.equals(chatType, "group")
                && !Objects.equals(chatType, "supergroup")
                && !Objects.equals(chatType, "channel")) {
            log.debug(
                    "Ignoring message {} in chat {} with unsupported chat type {}",
                    message.getMessageId(),
                    chat.getId(),
                    chatType);
            return;
        }

        log.info(
                "Received message {} in chat {} (type={}) message {}",
                message.getMessageId(),
                chat.getId(),
                chatType,
                message);

        if (telegramProperties.getEnableAllowUserIDs()
                || telegramProperties.getEnableAllowChannelIDs()) {
            List<Long> allowUserIDs = telegramProperties.getAllowUserIDs();
            List<Long> allowChannelIDs = telegramProperties.getAllowChannelIDs();
            switch (chatType) {
                case "channel" -> {
                    // In channels, messages are always sent on behalf of the channel
                    if (telegramProperties.getEnableAllowChannelIDs()) {
                        Chat senderChat = message.getSenderChat();
                        if ((senderChat == null || !allowChannelIDs.contains(senderChat.getId()))
                                && !allowChannelIDs.isEmpty()) {
                            log.info(
                                    "Ignoring message {} from user id={} in private chat id={} due"
                                            + " to channel access restrictions",
                                    message.getMessageId(),
                                    senderChat != null ? senderChat.getId() : "unknown",
                                    chat.getId());
                            sendMessage(
                                    chat.getId(),
                                    "This channel is not authorized to use this bot. Please contact"
                                            + " the administrator.");
                            return;
                        }
                        if (allowChannelIDs.isEmpty()) {
                            // All channels are allowed, but log a warning
                            log.warn(
                                    "No allowed channel IDs configured, allowing all channels"
                                            + " access. Channel with id={} sent a message in chat"
                                            + " id={}",
                                    senderChat != null ? senderChat.getId() : "unknown",
                                    chat.getId());
                        }
                    }
                }
                case "private" -> {
                    // In private chats, messages are sent by users
                    if (telegramProperties.getEnableAllowUserIDs()) {
                        User from = message.getFrom();
                        if ((from == null || !allowUserIDs.contains(from.getId()))
                                && !allowUserIDs.isEmpty()) {
                            log.info(
                                    "Ignoring message {} from channel id={} due to user access"
                                            + " restrictions",
                                    message.getMessageId(),
                                    chat.getId());
                            sendMessage(
                                    chat.getId(),
                                    "You are not authorized to use this bot. Please contact the"
                                            + " administrator.");
                            return;
                        }
                        if (allowUserIDs.isEmpty()) {
                            // All users are allowed, but log a warning
                            log.warn(
                                    "No allowed user IDs configured, allowing all users access."
                                            + " User with id={} sent a message in private chat id={}",
                                    from != null ? from.getId() : "unknown",
                                    chat.getId());
                        }
                    }
                }
                case "group", "supergroup" -> {
                    // group chats
                }
                default -> {
                    // should not reach here due to earlier chatType check
                }
            }
        }

        if (message.hasDocument()) {
            handleIncomingFile(message);
            return;
        }
        sendMessage(
                chat.getId(),
                "No valid file found in the message. Please send a document to process.");
    }

    @Override
    public String getBotUsername() {
        return telegramProperties.getBotUsername();
    }

    @Override
    public String getBotToken() {
        return telegramProperties.getBotToken();
    }

    private void handleIncomingFile(Message message) {
        Long chatId = message.getChatId();
        String chatType = message.getChat() != null ? message.getChat().getType() : null;
        String[] allowedMimeTypes = {"application/pdf"};
        Document document = message.getDocument();
        if (document != null) {
            String mimeType = document.getMimeType();
            if (mimeType != null && !List.of(allowedMimeTypes).contains(mimeType.toLowerCase())) {
                sendMessage(
                        message.getChatId(),
                        String.format(
                                "File mime type %s is not allowed. Allowed types are: %s",
                                mimeType, String.join(", ", allowedMimeTypes)));
                return;
            }
        }
        try {
            // Only send status messages in private chats and groups, not in channels
            if (!Objects.equals(chatType, "channel")) {
                sendMessage(chatId, "File received. Starting processing in pipeline folder...");
            }

            PipelineFileInfo fileInfo = downloadMessageFile(message);
            List<Path> outputs = waitForPipelineOutputs(fileInfo);

            if (outputs.isEmpty()) {
                sendMessage(
                        chatId,
                        "No results were found in the pipeline finished folder. Please check your"
                                + " pipeline configuration.");
                return;
            }

            for (Path output : outputs) {
                SendDocument sendDocument = new SendDocument();
                sendDocument.setChatId(chatId);
                sendDocument.setDocument(
                        new InputFile(output.toFile(), output.getFileName().toString()));
                execute(sendDocument);
            }

        } catch (TelegramApiException e) {
            log.error("Telegram API error while processing message {}", message.getMessageId(), e);
            sendMessage(chatId, "Error during processing: Telegram API error.");
        } catch (IOException e) {
            log.error("IO error while processing message {}", message.getMessageId(), e);
            sendMessage(chatId, "Error during processing: An IO error occurred.");
        } catch (Exception e) {
            log.error("Unexpected error while processing message {}", message.getMessageId(), e);
            sendMessage(chatId, "Error during processing: An unexpected error occurred.");
        }
    }

    private PipelineFileInfo downloadMessageFile(Message message)
            throws TelegramApiException, IOException {
        if (message.hasDocument()) {
            return downloadDocument(message);
        }
        throw new IllegalArgumentException("Unsupported file type");
    }

    private PipelineFileInfo downloadDocument(Message message)
            throws TelegramApiException, IOException {
        Document document = message.getDocument();
        String filename = document.getFileName();
        String name =
                StringUtils.isNotBlank(filename) ? filename : document.getFileUniqueId() + ".bin";
        return downloadFile(document.getFileId(), name, message);
    }

    private PipelineFileInfo downloadFile(String fileId, String originalName, Message message)
            throws TelegramApiException, IOException {

        GetFile getFile = new GetFile(fileId);
        File telegramFile = execute(getFile);

        if (telegramFile == null || StringUtils.isBlank(telegramFile.getFilePath())) {
            throw new IOException("Telegram did not return a valid file path");
        }

        URL downloadUrl = buildDownloadUrl(telegramFile.getFilePath());

        Long chatId = message.getChat() != null ? message.getChat().getId() : null;

        Path baseInbox =
                Paths.get(
                        runtimePathConfig.getPipelineWatchedFoldersPath(),
                        telegramProperties.getPipelineInboxFolder());

        Files.createDirectories(baseInbox);

        Path inboxFolder = baseInbox;
        if (telegramProperties.getCustomFolderSuffix() && chatId != null) {
            inboxFolder = baseInbox.resolve(chatId.toString());
        }

        Files.createDirectories(inboxFolder);

        boolean hasJsonConfig = Files.list(inboxFolder)
            .filter(Files::isRegularFile)
            .anyMatch(p -> p.toString().endsWith(".json"));

        if (!hasJsonConfig) {
            log.info("No JSON configuration file found in inbox folder {}", inboxFolder);
            sendMessage(chatId, "No JSON configuration file found in the inbox folder. Please contact the administrator.");
        }

        String uniqueBaseName = FilenameUtils.getBaseName(originalName) + "-" + UUID.randomUUID();
        String extension = FilenameUtils.getExtension(originalName);

        String targetFilename =
                extension.isBlank() ? uniqueBaseName : uniqueBaseName + "." + extension;

        Path targetFile = inboxFolder.resolve(targetFilename);

        try (InputStream inputStream = downloadUrl.openStream()) {
            Files.copy(inputStream, targetFile);
        }

        log.info("Saved Telegram file {} to {}", originalName, targetFile);
        return new PipelineFileInfo(targetFile, uniqueBaseName, Instant.now());
    }

    private URL buildDownloadUrl(String filePath) throws MalformedURLException {
        return URI.create(
                        String.format(
                                "https://api.telegram.org/file/bot%s/%s", getBotToken(), filePath))
                .toURL();
    }

    private List<Path> waitForPipelineOutputs(PipelineFileInfo info) throws IOException {

        Path finishedDir = Paths.get(runtimePathConfig.getPipelineFinishedFoldersPath());
        Files.createDirectories(finishedDir);

        Instant start = info.savedAt();
        Duration timeout = Duration.ofSeconds(telegramProperties.getProcessingTimeoutSeconds());
        Duration pollInterval = Duration.ofMillis(telegramProperties.getPollingIntervalMillis());
        List<Path> foundOutputs = new ArrayList<>();

        while (Duration.between(start, Instant.now()).compareTo(timeout) <= 0) {
            try (Stream<Path> files = Files.walk(finishedDir, 1)) {
                foundOutputs =
                        files.filter(Files::isRegularFile)
                                .filter(path -> matchesBaseName(info.uniqueBaseName(), path))
                                .filter(path -> isNewerThan(path, start))
                                .sorted(Comparator.comparing(Path::toString))
                                .toList();
            }

            if (!foundOutputs.isEmpty()) {
                break;
            }

            synchronized (this) {
                try {
                    wait(pollInterval.toMillis());
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
        }

        return foundOutputs;
    }

    private boolean matchesBaseName(String baseName, Path path) {
        return path.getFileName().toString().contains(baseName);
    }

    private boolean isNewerThan(Path path, Instant instant) {
        try {
            FileTime modifiedTime = Files.getLastModifiedTime(path);
            return modifiedTime.toInstant().isAfter(instant);
        } catch (IOException e) {
            log.debug("Could not read modification time for {}", path, e);
            return false;
        }
    }

    private void sendMessage(Long chatId, String text) {
        if (chatId == null) {
            return;
        }
        SendMessage message = new SendMessage();
        message.setChatId(chatId);
        message.setText(text);
        try {
            execute(message);
        } catch (TelegramApiException e) {
            log.warn("Failed to send Telegram message to {}", chatId, e);
        }
    }

    private record PipelineFileInfo(Path originalFile, String uniqueBaseName, Instant savedAt) {}
}
