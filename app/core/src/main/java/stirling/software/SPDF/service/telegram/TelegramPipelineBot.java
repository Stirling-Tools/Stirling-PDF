package stirling.software.SPDF.service.telegram;

import java.io.IOException;
import java.io.InputStream;
import java.net.MalformedURLException;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.URL;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
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

/**
 * Telegram bot that processes incoming files through a defined pipeline.
 *
 * @since 2.2.x
 */
@Slf4j
@Component
@ConditionalOnProperty(prefix = "telegram", name = "enabled", havingValue = "true")
public class TelegramPipelineBot extends TelegramLongPollingBot {

    private static final String CHAT_PRIVATE = "private";
    private static final String CHAT_GROUP = "group";
    private static final String CHAT_SUPERGROUP = "supergroup";
    private static final String CHAT_CHANNEL = "channel";

    private static final Set<String> SUPPORTED_CHAT_TYPES =
            Set.of(CHAT_PRIVATE, CHAT_GROUP, CHAT_SUPERGROUP, CHAT_CHANNEL);

    private static final Set<String> ALLOWED_MIME_TYPES = Set.of("application/pdf");

    private final Object pipelinePollMonitor = new Object();

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
        if (StringUtils.isAnyBlank(getBotUsername(), this.telegramProperties.getBotToken())) {
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
        Message message = extractMessage(update);
        if (message == null) {
            return;
        }

        Chat chat = message.getChat();
        if (chat == null || !isSupportedChatType(chat.getType())) {
            log.info(
                    "Ignoring message {}, unsupported chat type {}",
                    message.getMessageId(),
                    chat != null ? chat.getType() : "null");
            return;
        }

        if (!isAuthorized(message, chat)) {
            return;
        }

        if (update.hasMessage() && update.getMessage().hasText()) {
            String messageText = update.getMessage().getText();
            long chatId = update.getMessage().getChatId();
            if ("/start".equals(messageText)) {
                sendMessage(
                        chatId,
                        """
                        Welcome to the SPDF Telegram Bot!

                        To get started, please send me a PDF document that you would like to process.
                        Make sure the document is in PDF format.

                        Once I receive your document, I'll begin processing it through the pipeline.
                        """);
                return;
            }
        }

        if (message.hasDocument()) {
            handleIncomingFile(message);
            return;
        }
        if (feedback(FeedbackEnum.NO_VALID_DOCUMENT, chat.getType())) {
            sendMessage(
                    chat.getId(),
                    "No valid file found in the message. Please send a document to process.");
        }
    }

    private boolean feedback(FeedbackEnum feedbackEnum, String chatType) {
        return switch (feedbackEnum) {
            case NO_VALID_DOCUMENT ->
                    switch (chatType) {
                        case CHAT_CHANNEL ->
                                telegramProperties.getFeedback().getChannel().getNoValidDocument();
                        case CHAT_PRIVATE ->
                                telegramProperties.getFeedback().getUser().getNoValidDocument();
                        default -> true;
                    };
            case ERROR_MESSAGE ->
                    switch (chatType) {
                        case CHAT_CHANNEL ->
                                telegramProperties.getFeedback().getChannel().getErrorMessage();
                        case CHAT_PRIVATE ->
                                telegramProperties.getFeedback().getUser().getErrorMessage();
                        default -> true;
                    };
            case ERROR_PROCESSING ->
                    switch (chatType) {
                        case CHAT_CHANNEL ->
                                telegramProperties.getFeedback().getChannel().getErrorProcessing();
                        case CHAT_PRIVATE ->
                                telegramProperties.getFeedback().getUser().getErrorProcessing();
                        default -> true;
                    };
            case PROCESSING ->
                    switch (chatType) {
                        case CHAT_CHANNEL ->
                                telegramProperties.getFeedback().getChannel().getProcessing();
                        case CHAT_PRIVATE ->
                                telegramProperties.getFeedback().getUser().getProcessing();
                        default -> true;
                    };
            default -> true;
        };
    }

    // ---------------------------
    // Message Extraction / Chat Type
    // ---------------------------

    private Message extractMessage(Update update) {
        if (update.hasMessage()) return update.getMessage();
        if (update.hasChannelPost()) return update.getChannelPost();
        return null;
    }

    private boolean isSupportedChatType(String type) {
        return type != null && SUPPORTED_CHAT_TYPES.contains(type);
    }

    // ---------------------------
    // Authorization
    // ---------------------------

    private boolean isAuthorized(Message message, Chat chat) {
        if (!(telegramProperties.getEnableAllowUserIDs()
                || telegramProperties.getEnableAllowChannelIDs())) {
            return true;
        }

        return switch (chat.getType()) {
            case CHAT_CHANNEL -> checkChannelAccess(message, chat);
            case CHAT_PRIVATE -> checkUserAccess(message, chat);
            case CHAT_GROUP, CHAT_SUPERGROUP -> true; // groups allowed by default
            default -> false;
        };
    }

    private boolean checkUserAccess(Message message, Chat chat) {
        if (!telegramProperties.getEnableAllowUserIDs()) return true;

        User from = message.getFrom();
        List<Long> allow = telegramProperties.getAllowUserIDs();

        if (allow.isEmpty()) {
            log.warn("No allowed user IDs configured - allowing all users.");
            return true;
        }

        if (from == null || !allow.contains(from.getId())) {
            log.info(
                    "Rejecting user {} in private chat {}",
                    from != null ? from.getId() : "unknown",
                    chat.getId());
            if (feedback(FeedbackEnum.ERROR_MESSAGE, chat.getType())) {
                sendMessage(chat.getId(), "You are not authorized to use this bot.");
            }
            return false;
        }

        return true;
    }

    private boolean checkChannelAccess(Message message, Chat chat) {
        if (!telegramProperties.getEnableAllowChannelIDs()) return true;

        Chat senderChat = message.getSenderChat();
        List<Long> allow = telegramProperties.getAllowChannelIDs();

        if (allow.isEmpty()) {
            log.warn("No allowed channel IDs configured - allowing all channels.");
            return true;
        }

        if (senderChat == null || !allow.contains(senderChat.getId())) {
            log.info(
                    "Rejecting channel {} in chat {}",
                    senderChat != null ? senderChat.getId() : "unknown",
                    chat.getId());
            if (feedback(FeedbackEnum.ERROR_MESSAGE, chat.getType())) {
                sendMessage(chat.getId(), "This channel is not authorized to use this bot.");
            }
            return false;
        }

        return true;
    }

    // ---------------------------
    // File Handling
    // ---------------------------

    private void handleIncomingFile(Message message) {
        Long chatId = message.getChatId();
        Document doc = message.getDocument();
        String chatType = message.getChat().getType();

        if (doc == null) {
            if (feedback(FeedbackEnum.NO_VALID_DOCUMENT, chatType)) {
                sendMessage(chatId, "No document found.");
            }
            return;
        }

        if (doc.getMimeType() != null
                && !ALLOWED_MIME_TYPES.contains(doc.getMimeType().toLowerCase())) {
            if (feedback(FeedbackEnum.NO_VALID_DOCUMENT, chatType)) {
                sendMessage(
                        chatId,
                        "Unsupported MIME type: "
                                + doc.getMimeType()
                                + "\nAllowed: "
                                + String.join(", ", ALLOWED_MIME_TYPES));
            }
            return;
        }

        if (!hasJsonConfig(chatId)) {
            if (feedback(FeedbackEnum.ERROR_PROCESSING, chatType)) {
                sendMessage(
                        chatId,
                        "No JSON configuration file found in the pipeline inbox folder. Please"
                                + " contact the administrator.");
            }
            return;
        }

        try {
            if (!CHAT_CHANNEL.equalsIgnoreCase(chatType)
                    && feedback(FeedbackEnum.PROCESSING, chatType)) {
                sendMessage(chatId, "File received. Starting processing...");
            }

            PipelineFileInfo info = downloadMessageFile(message);
            List<Path> outputs = waitForPipelineOutputs(info);

            if (outputs.isEmpty()) {
                if (feedback(FeedbackEnum.ERROR_PROCESSING, chatType)) {
                    sendMessage(
                            chatId,
                            "No results were found in the pipeline output folder. Check"
                                    + " configuration.");
                }
                return;
            }

            for (Path file : outputs) {
                SendDocument out = new SendDocument();
                out.setChatId(chatId);
                out.setDocument(new InputFile(file.toFile(), file.getFileName().toString()));
                execute(out);
            }

        } catch (TelegramApiException e) {
            log.error("Telegram API error", e);
            if (feedback(FeedbackEnum.ERROR_MESSAGE, chatType)) {
                sendMessage(chatId, "Telegram API error occurred.");
            }
        } catch (IOException e) {
            log.error("IO error", e);
            if (feedback(FeedbackEnum.ERROR_MESSAGE, chatType)) {
                sendMessage(chatId, "An IO error occurred.");
            }
        } catch (Exception e) {
            log.error("Unexpected error", e);
            if (feedback(FeedbackEnum.ERROR_MESSAGE, chatType)) {
                sendMessage(chatId, "Unexpected error occurred.");
            }
        }
    }

    private PipelineFileInfo downloadMessageFile(Message message)
            throws TelegramApiException, IOException {
        Document document = message.getDocument();
        String filename = document.getFileName();
        String name =
                StringUtils.isNotBlank(filename) ? filename : document.getFileUniqueId() + ".bin";

        return downloadFile(document.getFileId(), name, message);
    }

    private PipelineFileInfo downloadFile(String fileId, String originalName, Message message)
            throws TelegramApiException, IOException {

        Long chatId = message.getChatId();

        Path inboxFolder = getInboxFolder(chatId);

        GetFile getFile = new GetFile(fileId);
        File tgFile = execute(getFile);

        if (tgFile == null || StringUtils.isBlank(tgFile.getFilePath())) {
            throw new IOException("Telegram did not return a file path.");
        }

        URL url = buildDownloadUrl(tgFile.getFilePath());

        String base = FilenameUtils.getBaseName(originalName) + "-" + UUID.randomUUID();
        String ext = FilenameUtils.getExtension(originalName);
        String outFile = ext.isBlank() ? base : base + "." + ext;

        Path targetFile = inboxFolder.resolve(outFile);

        try (InputStream in = url.openStream()) {
            Files.copy(in, targetFile);
        }

        log.info("Saved Telegram file {} to {}", originalName, targetFile);
        return new PipelineFileInfo(targetFile, base, Instant.now());
    }

    private URL buildDownloadUrl(String filePath) throws MalformedURLException {
        try {
            URI uri =
                    new URI(
                            "https",
                            "api.telegram.org",
                            "/file/bot" + this.telegramProperties.getBotToken() + "/" + filePath,
                            null);
            return uri.toURL();
        } catch (URISyntaxException e) {
            throw new MalformedURLException("Failed to build Telegram download URL");
        } catch (MalformedURLException e) {
            MalformedURLException sanitized =
                    new MalformedURLException("Failed to build Telegram download URL");
            sanitized.initCause(e);
            throw sanitized;
        }
    }

    // ---------------------------
    // Inbox-Ordner & JSON-Check
    // ---------------------------

    private Path getInboxFolder(Long chatId) throws IOException {
        Path baseInbox =
                Paths.get(
                        runtimePathConfig.getPipelineWatchedFoldersPath(),
                        telegramProperties.getPipelineInboxFolder());

        Files.createDirectories(baseInbox);

        Path inboxFolder =
                telegramProperties.getCustomFolderSuffix()
                        ? baseInbox.resolve(chatId.toString())
                        : baseInbox;

        Files.createDirectories(inboxFolder);

        return inboxFolder;
    }

    private boolean hasJsonConfig(Long chatId) {
        try {
            Path inboxFolder = getInboxFolder(chatId);
            try (Stream<Path> s = Files.list(inboxFolder)) {
                return s.anyMatch(p -> p.toString().endsWith(".json"));
            }
        } catch (IOException e) {
            log.error("Failed to check JSON config for chat {}", chatId, e);
            return false;
        }
    }

    // ---------------------------
    // Pipeline polling
    // ---------------------------

    private List<Path> waitForPipelineOutputs(PipelineFileInfo info) throws IOException {

        Path finishedDir = Paths.get(runtimePathConfig.getPipelineFinishedFoldersPath());
        Files.createDirectories(finishedDir);

        Instant start = info.savedAt();
        Duration timeout = Duration.ofSeconds(telegramProperties.getProcessingTimeoutSeconds());
        Duration poll = Duration.ofMillis(telegramProperties.getPollingIntervalMillis());
        List<Path> results = new ArrayList<>();

        while (Duration.between(start, Instant.now()).compareTo(timeout) <= 0) {
            try (Stream<Path> s = Files.list(finishedDir)) {
                results =
                        s.filter(Files::isRegularFile)
                                .filter(path -> matchesBaseName(info.uniqueBaseName(), path))
                                .filter(path -> isNewerThan(path, start))
                                .sorted(Comparator.comparing(Path::toString))
                                .toList();
            }

            if (!results.isEmpty()) {
                break;
            }

            synchronized (pipelinePollMonitor) {
                try {
                    pipelinePollMonitor.wait(poll.toMillis());
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
        }

        return results;
    }

    private boolean matchesBaseName(String base, Path file) {
        return file.getFileName().toString().contains(base);
    }

    private boolean isNewerThan(Path path, Instant since) {
        try {
            return Files.getLastModifiedTime(path).toInstant().isAfter(since);
        } catch (IOException e) {
            log.info("Could not read modification time for {}", path);
            return false;
        }
    }

    // ---------------------------
    // Messaging
    // ---------------------------

    private void sendMessage(Long chatId, String text) {
        if (chatId == null) return;

        SendMessage msg = new SendMessage();
        msg.setChatId(chatId);
        msg.setText(text);
        try {
            execute(msg);
        } catch (TelegramApiException e) {
            log.warn("Failed to send message to {}", chatId, e);
        }
    }

    private record PipelineFileInfo(Path originalFile, String uniqueBaseName, Instant savedAt) {}

    @Override
    public String getBotUsername() {
        return telegramProperties.getBotUsername();
    }
}
