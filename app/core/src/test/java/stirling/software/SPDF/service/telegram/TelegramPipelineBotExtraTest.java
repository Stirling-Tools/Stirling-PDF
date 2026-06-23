package stirling.software.SPDF.service.telegram;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.lang.reflect.Method;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;

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
import org.telegram.telegrambots.meta.api.methods.send.SendMessage;
import org.telegram.telegrambots.meta.exceptions.TelegramApiException;

import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.model.ApplicationProperties;

/**
 * Network-free coverage for {@link TelegramPipelineBot} private helpers: feedback resolution per
 * chat type, inbox folder layout, the download-URL builder, JSON-config detection, pipeline-output
 * matching/freshness, and the sendMessage failure swallow. The Telegram client {@code execute(...)}
 * boundary is stubbed on a spy.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("TelegramPipelineBot helper coverage")
class TelegramPipelineBotExtraTest {

    @Mock private TelegramBotsApi telegramBotsApi;
    @Mock private RuntimePathConfig runtimePathConfig;

    @TempDir Path watchedRoot;
    @TempDir Path finishedRoot;

    private ApplicationProperties.Telegram telegramProps;
    private TelegramPipelineBot bot;

    @BeforeEach
    void setUp() {
        ApplicationProperties applicationProperties = new ApplicationProperties();
        telegramProps = new ApplicationProperties.Telegram();
        telegramProps.setBotToken("secret-token");
        telegramProps.setBotUsername("test-bot");
        telegramProps.setPipelineInboxFolder("telegram");
        telegramProps.setCustomFolderSuffix(false);
        telegramProps.setProcessingTimeoutSeconds(1);
        telegramProps.setPollingIntervalMillis(10);
        applicationProperties.setTelegram(telegramProps);

        when(runtimePathConfig.getPipelineWatchedFoldersPath()).thenReturn(watchedRoot.toString());
        when(runtimePathConfig.getPipelineFinishedFoldersPath())
                .thenReturn(finishedRoot.toString());

        bot =
                spy(
                        new TelegramPipelineBot(
                                applicationProperties, runtimePathConfig, telegramBotsApi));
    }

    private Object invoke(String name, Class<?>[] sig, Object... args) throws Exception {
        Method m = TelegramPipelineBot.class.getDeclaredMethod(name, sig);
        m.setAccessible(true);
        return m.invoke(bot, args);
    }

    private boolean feedback(FeedbackEnum kind, String chatType) throws Exception {
        return (boolean)
                invoke(
                        "feedback",
                        new Class<?>[] {FeedbackEnum.class, String.class},
                        kind,
                        chatType);
    }

    @Nested
    @DisplayName("feedback resolution")
    class Feedback {

        @Test
        @DisplayName("group and supergroup chats always receive feedback (default true)")
        void groupsDefaultTrue() throws Exception {
            assertThat(feedback(FeedbackEnum.NO_VALID_DOCUMENT, "group")).isTrue();
            assertThat(feedback(FeedbackEnum.ERROR_MESSAGE, "supergroup")).isTrue();
            assertThat(feedback(FeedbackEnum.PROCESSING, "group")).isTrue();
            assertThat(feedback(FeedbackEnum.ERROR_PROCESSING, "supergroup")).isTrue();
        }

        @Test
        @DisplayName("private chat honours the per-user toggle")
        void privateUserToggle() throws Exception {
            assertThat(feedback(FeedbackEnum.PROCESSING, "private")).isTrue();
            telegramProps.getFeedback().getUser().setProcessing(false);
            assertThat(feedback(FeedbackEnum.PROCESSING, "private")).isFalse();
        }

        @Test
        @DisplayName("channel chat honours the per-channel toggle")
        void channelToggle() throws Exception {
            assertThat(feedback(FeedbackEnum.ERROR_MESSAGE, "channel")).isTrue();
            telegramProps.getFeedback().getChannel().setErrorMessage(false);
            assertThat(feedback(FeedbackEnum.ERROR_MESSAGE, "channel")).isFalse();
        }
    }

    @Nested
    @DisplayName("getInboxFolder")
    class GetInboxFolder {

        private Path inbox(Long chatId) throws Exception {
            return (Path) invoke("getInboxFolder", new Class<?>[] {Long.class}, chatId);
        }

        @Test
        @DisplayName("without a custom suffix the base inbox folder is used")
        void noSuffix() throws Exception {
            Path folder = inbox(42L);
            assertThat(folder).isEqualTo(watchedRoot.resolve("telegram"));
            assertThat(Files.isDirectory(folder)).isTrue();
        }

        @Test
        @DisplayName("with a custom suffix the chat id is appended as a subfolder")
        void withSuffix() throws Exception {
            telegramProps.setCustomFolderSuffix(true);
            Path folder = inbox(99L);
            assertThat(folder).isEqualTo(watchedRoot.resolve("telegram").resolve("99"));
            assertThat(Files.isDirectory(folder)).isTrue();
        }
    }

    @Nested
    @DisplayName("buildDownloadUrl")
    class BuildDownloadUrl {

        @Test
        @DisplayName("builds an https api.telegram.org url embedding the bot token and file path")
        void buildsUrl() throws Exception {
            URL url =
                    (URL)
                            invoke(
                                    "buildDownloadUrl",
                                    new Class<?>[] {String.class},
                                    "documents/file_1.pdf");
            assertThat(url.getProtocol()).isEqualTo("https");
            assertThat(url.getHost()).isEqualTo("api.telegram.org");
            assertThat(url.getPath()).contains("/file/botsecret-token/");
            assertThat(url.getPath()).contains("documents/file_1.pdf");
        }
    }

    @Nested
    @DisplayName("hasJsonConfig")
    class HasJsonConfig {

        private boolean hasJsonConfig(Long chatId) throws Exception {
            return (boolean) invoke("hasJsonConfig", new Class<?>[] {Long.class}, chatId);
        }

        @Test
        @DisplayName("false when the inbox contains no json file")
        void noJson() throws Exception {
            assertThat(hasJsonConfig(7L)).isFalse();
        }

        @Test
        @DisplayName("true once a json file is present in the inbox")
        void withJson() throws Exception {
            Path inbox = watchedRoot.resolve("telegram");
            Files.createDirectories(inbox);
            Files.write(inbox.resolve("pipeline.json"), "{}".getBytes(StandardCharsets.UTF_8));
            assertThat(hasJsonConfig(7L)).isTrue();
        }
    }

    @Nested
    @DisplayName("pipeline output matching")
    class PipelineOutputMatching {

        private boolean matchesBaseName(String base, Path file) throws Exception {
            return (boolean)
                    invoke(
                            "matchesBaseName",
                            new Class<?>[] {String.class, Path.class},
                            base,
                            file);
        }

        private boolean isNewerThan(Path path, Instant since) throws Exception {
            return (boolean)
                    invoke("isNewerThan", new Class<?>[] {Path.class, Instant.class}, path, since);
        }

        @Test
        @DisplayName("matchesBaseName checks the filename contains the unique base")
        void baseNameContains() throws Exception {
            Path p = finishedRoot.resolve("doc-abc123-out.pdf");
            assertThat(matchesBaseName("abc123", p)).isTrue();
            assertThat(matchesBaseName("zzz", p)).isFalse();
        }

        @Test
        @DisplayName("isNewerThan is true for a file modified after the reference instant")
        void newerFile() throws Exception {
            Path p = finishedRoot.resolve("fresh.pdf");
            Files.write(p, new byte[] {1});
            assertThat(isNewerThan(p, Instant.now().minusSeconds(60))).isTrue();
        }

        @Test
        @DisplayName("isNewerThan is false when the file cannot be read")
        void missingFile() throws Exception {
            Path missing = finishedRoot.resolve("never-existed.pdf");
            assertThat(isNewerThan(missing, Instant.now())).isFalse();
        }

        @Test
        @DisplayName("waitForPipelineOutputs returns matching, fresh outputs from the finished dir")
        void collectsOutputs() throws Exception {
            // savedAt must be within the 1s processing timeout but before the output file mtime.
            Instant savedAt = Instant.now().minusMillis(200);
            Path out = finishedRoot.resolve("job-unique42-result.pdf");
            Files.write(out, new byte[] {1, 2, 3});

            Object info = newPipelineFileInfo(finishedRoot.resolve("src.pdf"), "unique42", savedAt);

            @SuppressWarnings("unchecked")
            List<Path> results =
                    (List<Path>)
                            invoke(
                                    "waitForPipelineOutputs",
                                    new Class<?>[] {pipelineFileInfoClass()},
                                    info);

            assertThat(results).contains(out);
        }

        private Class<?> pipelineFileInfoClass() throws Exception {
            return Class.forName(
                    "stirling.software.SPDF.service.telegram.TelegramPipelineBot$PipelineFileInfo");
        }

        private Object newPipelineFileInfo(Path file, String base, Instant savedAt)
                throws Exception {
            Class<?> cls = pipelineFileInfoClass();
            var ctor = cls.getDeclaredConstructor(Path.class, String.class, Instant.class);
            ctor.setAccessible(true);
            return ctor.newInstance(file, base, savedAt);
        }
    }

    @Nested
    @DisplayName("sendMessage")
    class SendMessageBehaviour {

        private void sendMessage(Long chatId, String text) throws Exception {
            invoke("sendMessage", new Class<?>[] {Long.class, String.class}, chatId, text);
        }

        @Test
        @DisplayName("a null chat id is a no-op and never calls execute")
        void nullChatIdNoOp() throws Exception {
            sendMessage(null, "hi");
            verify(bot, org.mockito.Mockito.never()).execute(any(SendMessage.class));
        }

        @Test
        @DisplayName("a TelegramApiException from execute is swallowed")
        void swallowsApiException() throws Exception {
            doThrow(new TelegramApiException("boom")).when(bot).execute(any(SendMessage.class));
            // must not propagate
            sendMessage(123L, "hello");
            verify(bot).execute(any(SendMessage.class));
        }

        @Test
        @DisplayName("a successful send invokes execute once")
        void successfulSend() throws Exception {
            doReturn(null).when(bot).execute(any(SendMessage.class));
            sendMessage(456L, "ok");
            verify(bot).execute(any(SendMessage.class));
        }
    }
}
