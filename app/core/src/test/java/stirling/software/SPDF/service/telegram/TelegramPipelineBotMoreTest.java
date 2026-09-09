package stirling.software.SPDF.service.telegram;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.telegram.telegrambots.meta.TelegramBotsApi;
import org.telegram.telegrambots.meta.api.methods.GetFile;
import org.telegram.telegrambots.meta.api.methods.send.SendMessage;
import org.telegram.telegrambots.meta.api.objects.Chat;
import org.telegram.telegrambots.meta.api.objects.Document;
import org.telegram.telegrambots.meta.api.objects.Message;
import org.telegram.telegrambots.meta.api.objects.Update;
import org.telegram.telegrambots.meta.exceptions.TelegramApiException;

import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.model.ApplicationProperties;

/**
 * Additional gap tests for {@link TelegramPipelineBot}. The Telegram client boundary (the {@code
 * execute(...)} calls) is stubbed on a spy so no network traffic occurs. File handling uses an
 * on-disk {@link TempDir} inbox.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class TelegramPipelineBotMoreTest {

    @Mock private TelegramBotsApi telegramBotsApi;
    @Mock private RuntimePathConfig runtimePathConfig;

    @TempDir Path watchedRoot;
    @TempDir Path finishedRoot;

    private ApplicationProperties applicationProperties;
    private ApplicationProperties.Telegram telegramProps;
    private TelegramPipelineBot bot;

    @BeforeEach
    void setUp() {
        applicationProperties = new ApplicationProperties();
        telegramProps = new ApplicationProperties.Telegram();
        telegramProps.setBotToken("test-token");
        telegramProps.setBotUsername("test-bot");
        telegramProps.setEnableAllowUserIDs(false);
        telegramProps.setEnableAllowChannelIDs(false);
        telegramProps.setPipelineInboxFolder("telegram");
        telegramProps.setCustomFolderSuffix(false);
        applicationProperties.setTelegram(telegramProps);

        when(runtimePathConfig.getPipelineWatchedFoldersPath()).thenReturn(watchedRoot.toString());
        when(runtimePathConfig.getPipelineFinishedFoldersPath())
                .thenReturn(finishedRoot.toString());

        bot =
                spy(
                        new TelegramPipelineBot(
                                applicationProperties, runtimePathConfig, telegramBotsApi));
    }

    private Update textUpdate(String text, String chatType, long chatId) {
        Update update = mock(Update.class);
        Message message = mock(Message.class);
        Chat chat = mock(Chat.class);

        when(update.hasMessage()).thenReturn(true);
        when(update.getMessage()).thenReturn(message);
        when(message.getChat()).thenReturn(chat);
        when(chat.getType()).thenReturn(chatType);
        when(chat.getId()).thenReturn(chatId);
        when(message.hasText()).thenReturn(true);
        when(message.getText()).thenReturn(text);
        when(message.hasDocument()).thenReturn(false);
        return update;
    }

    private Update documentUpdate(String mimeType, String fileName, long chatId) {
        Update update = mock(Update.class);
        Message message = mock(Message.class);
        Chat chat = mock(Chat.class);
        Document document = mock(Document.class);

        when(update.hasMessage()).thenReturn(true);
        when(update.getMessage()).thenReturn(message);
        when(message.getChat()).thenReturn(chat);
        when(chat.getType()).thenReturn("private");
        when(chat.getId()).thenReturn(chatId);
        when(message.hasText()).thenReturn(false);
        when(message.hasDocument()).thenReturn(true);
        when(message.getDocument()).thenReturn(document);
        when(message.getChatId()).thenReturn(chatId);
        when(document.getMimeType()).thenReturn(mimeType);
        when(document.getFileName()).thenReturn(fileName);
        when(document.getFileId()).thenReturn("file-id-123");
        when(document.getFileUniqueId()).thenReturn("uniq-123");
        return update;
    }

    private Path inboxFolder() {
        return watchedRoot.resolve("telegram");
    }

    private void writeJsonInInbox() throws Exception {
        Path inbox = inboxFolder();
        Files.createDirectories(inbox);
        Files.write(inbox.resolve("config.json"), "{}".getBytes(StandardCharsets.UTF_8));
    }

    @Nested
    @DisplayName("text command routing")
    class TextCommands {

        @Test
        @DisplayName("unknown text command falls through to the no-valid-file feedback")
        void unknownText_sendsNoValidFile() throws TelegramApiException {
            doReturn(null).when(bot).execute(any(SendMessage.class));

            bot.onUpdateReceived(textUpdate("/help", "private", 100L));

            verify(bot)
                    .execute(
                            (SendMessage)
                                    org.mockito.ArgumentMatchers.argThat(
                                            arg ->
                                                    arg instanceof SendMessage sm
                                                            && sm.getText()
                                                                    .contains("No valid file")));
        }

        @Test
        @DisplayName("arbitrary text falls through to the no-valid-file feedback")
        void arbitraryText_sendsNoValidFile() throws TelegramApiException {
            doReturn(null).when(bot).execute(any(SendMessage.class));

            bot.onUpdateReceived(textUpdate("hello bot", "private", 101L));

            verify(bot, atLeastOnce()).execute(any(SendMessage.class));
        }
    }

    @Nested
    @DisplayName("handleIncomingFile - pre-download guards")
    class PreDownloadGuards {

        @Test
        @DisplayName("missing JSON config sends the contact-administrator message")
        void noJsonConfig_sendsAdminMessage() throws TelegramApiException {
            doReturn(null).when(bot).execute(any(SendMessage.class));
            // No json written to the inbox folder.

            bot.onUpdateReceived(documentUpdate("application/pdf", "doc.pdf", 200L));

            verify(bot)
                    .execute(
                            (SendMessage)
                                    org.mockito.ArgumentMatchers.argThat(
                                            arg ->
                                                    arg instanceof SendMessage sm
                                                            && sm.getText()
                                                                    .contains(
                                                                            "No JSON"
                                                                                    + " configuration")));
        }

        @Test
        @DisplayName("uppercase PDF mime type is accepted and passes the mime guard")
        void uppercaseMime_passesGuard() throws TelegramApiException {
            doReturn(null).when(bot).execute(any(SendMessage.class));
            // No json config -> still stops at the JSON guard, proving the mime guard passed.

            bot.onUpdateReceived(documentUpdate("APPLICATION/PDF", "doc.pdf", 201L));

            verify(bot)
                    .execute(
                            (SendMessage)
                                    org.mockito.ArgumentMatchers.argThat(
                                            arg ->
                                                    arg instanceof SendMessage sm
                                                            && sm.getText()
                                                                    .contains(
                                                                            "No JSON"
                                                                                    + " configuration")));
        }

        @Test
        @DisplayName("null mime type skips the mime guard and reaches the JSON guard")
        void nullMime_reachesJsonGuard() throws TelegramApiException {
            doReturn(null).when(bot).execute(any(SendMessage.class));

            bot.onUpdateReceived(documentUpdate(null, "doc.pdf", 202L));

            verify(bot)
                    .execute(
                            (SendMessage)
                                    org.mockito.ArgumentMatchers.argThat(
                                            arg ->
                                                    arg instanceof SendMessage sm
                                                            && sm.getText()
                                                                    .contains(
                                                                            "No JSON"
                                                                                    + " configuration")));
        }
    }

    @Nested
    @DisplayName("handleIncomingFile - processing and error replies")
    class ProcessingAndErrors {

        @Test
        @DisplayName("with config present, processing message is sent then GetFile failure errors")
        void processingThenTelegramError() throws Exception {
            writeJsonInInbox();
            doReturn(null).when(bot).execute(any(SendMessage.class));
            // GetFile execution fails -> caught as TelegramApiException -> error reply.
            doThrow(new TelegramApiException("get file failed"))
                    .when(bot)
                    .execute(any(GetFile.class));

            bot.onUpdateReceived(documentUpdate("application/pdf", "doc.pdf", 300L));

            // "File received. Starting processing..." processing feedback was sent.
            verify(bot)
                    .execute(
                            (SendMessage)
                                    org.mockito.ArgumentMatchers.argThat(
                                            arg ->
                                                    arg instanceof SendMessage sm
                                                            && sm.getText()
                                                                    .contains(
                                                                            "Starting"
                                                                                    + " processing")));
            // The Telegram API error reply was sent.
            verify(bot)
                    .execute(
                            (SendMessage)
                                    org.mockito.ArgumentMatchers.argThat(
                                            arg ->
                                                    arg instanceof SendMessage sm
                                                            && sm.getText()
                                                                    .contains(
                                                                            "Telegram API"
                                                                                    + " error")));
        }

        @Test
        @DisplayName("processing feedback disabled for user suppresses the processing message")
        void processingFeedbackDisabled_noProcessingMessage() throws Exception {
            writeJsonInInbox();
            telegramProps.getFeedback().getUser().setProcessing(false);
            doReturn(null).when(bot).execute(any(SendMessage.class));
            doThrow(new TelegramApiException("get file failed"))
                    .when(bot)
                    .execute(any(GetFile.class));

            bot.onUpdateReceived(documentUpdate("application/pdf", "doc.pdf", 301L));

            verify(bot, never())
                    .execute(
                            (SendMessage)
                                    org.mockito.ArgumentMatchers.argThat(
                                            arg ->
                                                    arg instanceof SendMessage sm
                                                            && sm.getText()
                                                                    .contains(
                                                                            "Starting"
                                                                                    + " processing")));
        }

        @Test
        @DisplayName("GetFile returning null path raises an IO error reply")
        void getFileNullPath_sendsIoError() throws Exception {
            writeJsonInInbox();
            doReturn(null).when(bot).execute(any(SendMessage.class));
            // Telegram returns a File with no path -> IOException -> IO error reply.
            org.telegram.telegrambots.meta.api.objects.File tgFile =
                    mock(org.telegram.telegrambots.meta.api.objects.File.class);
            when(tgFile.getFilePath()).thenReturn(null);
            doReturn(tgFile).when(bot).execute(any(GetFile.class));

            bot.onUpdateReceived(documentUpdate("application/pdf", "doc.pdf", 302L));

            verify(bot)
                    .execute(
                            (SendMessage)
                                    org.mockito.ArgumentMatchers.argThat(
                                            arg ->
                                                    arg instanceof SendMessage sm
                                                            && sm.getText().contains("IO error")));
        }
    }
}
