package stirling.software.SPDF.service.telegram;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.telegram.telegrambots.meta.TelegramBotsApi;
import org.telegram.telegrambots.meta.api.methods.send.SendMessage;
import org.telegram.telegrambots.meta.api.objects.Chat;
import org.telegram.telegrambots.meta.api.objects.Document;
import org.telegram.telegrambots.meta.api.objects.Message;
import org.telegram.telegrambots.meta.api.objects.Update;
import org.telegram.telegrambots.meta.api.objects.User;
import org.telegram.telegrambots.meta.exceptions.TelegramApiException;

import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.model.ApplicationProperties;

@ExtendWith(MockitoExtension.class)
class TelegramPipelineBotTest {

    @Mock private TelegramBotsApi telegramBotsApi;
    @Mock private RuntimePathConfig runtimePathConfig;

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
        applicationProperties.setTelegram(telegramProps);

        bot =
                spy(
                        new TelegramPipelineBot(
                                applicationProperties, runtimePathConfig, telegramBotsApi));
    }

    // ---------------------------
    // register()
    // ---------------------------

    @Test
    void register_successfulRegistration() throws TelegramApiException {
        bot.register();
        verify(telegramBotsApi).registerBot(bot);
    }

    @Test
    void register_blankBotUsername_doesNotRegister() throws TelegramApiException {
        telegramProps.setBotUsername("");
        bot =
                spy(
                        new TelegramPipelineBot(
                                applicationProperties, runtimePathConfig, telegramBotsApi));

        bot.register();
        verify(telegramBotsApi, never()).registerBot(any());
    }

    @Test
    void register_blankBotToken_doesNotRegister() throws TelegramApiException {
        telegramProps.setBotToken("");
        bot =
                spy(
                        new TelegramPipelineBot(
                                applicationProperties, runtimePathConfig, telegramBotsApi));

        bot.register();
        verify(telegramBotsApi, never()).registerBot(any());
    }

    @Test
    void register_telegramApiException_doesNotThrow() throws TelegramApiException {
        doThrow(new TelegramApiException("fail")).when(telegramBotsApi).registerBot(any());
        // Should not throw
        bot.register();
        verify(telegramBotsApi).registerBot(bot);
    }

    // ---------------------------
    // onUpdateReceived() - message extraction
    // ---------------------------

    @Test
    void onUpdateReceived_noMessageNoChannelPost_returnsEarly() {
        Update update = mock(Update.class);
        when(update.hasMessage()).thenReturn(false);
        when(update.hasChannelPost()).thenReturn(false);

        bot.onUpdateReceived(update);
        // No exception, no interaction with execute
    }

    @Test
    void onUpdateReceived_unsupportedChatType_returnsEarly() throws TelegramApiException {
        Update update = mock(Update.class);
        Message message = mock(Message.class);
        Chat chat = mock(Chat.class);

        when(update.hasMessage()).thenReturn(true);
        when(update.getMessage()).thenReturn(message);
        when(message.getChat()).thenReturn(chat);
        when(chat.getType()).thenReturn("unknown_type");

        bot.onUpdateReceived(update);
        verify(bot, never()).execute(any(SendMessage.class));
    }

    @Test
    void onUpdateReceived_nullChat_returnsEarly() throws TelegramApiException {
        Update update = mock(Update.class);
        Message message = mock(Message.class);

        when(update.hasMessage()).thenReturn(true);
        when(update.getMessage()).thenReturn(message);
        when(message.getChat()).thenReturn(null);

        bot.onUpdateReceived(update);
        verify(bot, never()).execute(any(SendMessage.class));
    }

    // ---------------------------
    // onUpdateReceived() - /start command
    // ---------------------------

    @Test
    void onUpdateReceived_startCommand_sendsWelcome() throws TelegramApiException {
        Update update = mock(Update.class);
        Message message = mock(Message.class);
        Chat chat = mock(Chat.class);

        when(update.hasMessage()).thenReturn(true);
        when(update.getMessage()).thenReturn(message);
        when(message.getChat()).thenReturn(chat);
        when(chat.getType()).thenReturn("private");
        when(message.hasText()).thenReturn(true);
        when(message.getText()).thenReturn("/start");
        when(message.getChatId()).thenReturn(123L);

        doReturn(null).when(bot).execute(any(SendMessage.class));

        bot.onUpdateReceived(update);

        verify(bot)
                .execute(
                        (SendMessage)
                                argThat(
                                        arg -> {
                                            if (arg instanceof SendMessage sm) {
                                                return sm.getText().contains("Welcome")
                                                        && "123".equals(sm.getChatId());
                                            }
                                            return false;
                                        }));
    }

    // ---------------------------
    // onUpdateReceived() - no document, feedback message
    // ---------------------------

    @Test
    void onUpdateReceived_noDocumentPrivateChat_sendsNoValidDocumentMessage()
            throws TelegramApiException {
        Update update = mock(Update.class);
        Message message = mock(Message.class);
        Chat chat = mock(Chat.class);

        when(update.hasMessage()).thenReturn(true);
        when(update.getMessage()).thenReturn(message);
        when(message.getChat()).thenReturn(chat);
        when(chat.getType()).thenReturn("private");
        when(chat.getId()).thenReturn(456L);
        when(message.hasText()).thenReturn(false);
        when(message.hasDocument()).thenReturn(false);

        doReturn(null).when(bot).execute(any(SendMessage.class));

        bot.onUpdateReceived(update);

        verify(bot)
                .execute(
                        (SendMessage)
                                argThat(
                                        arg -> {
                                            if (arg instanceof SendMessage sm) {
                                                return sm.getText().contains("No valid file");
                                            }
                                            return false;
                                        }));
    }

    @Test
    void onUpdateReceived_noDocumentChannelFeedbackDisabled_noMessage()
            throws TelegramApiException {
        telegramProps.getFeedback().getChannel().setNoValidDocument(false);

        Update update = mock(Update.class);
        Message message = mock(Message.class);
        Chat chat = mock(Chat.class);

        when(update.hasMessage()).thenReturn(false);
        when(update.hasChannelPost()).thenReturn(true);
        when(update.getChannelPost()).thenReturn(message);
        when(message.getChat()).thenReturn(chat);
        when(chat.getType()).thenReturn("channel");
        when(message.hasDocument()).thenReturn(false);

        bot.onUpdateReceived(update);

        verify(bot, never()).execute(any(SendMessage.class));
    }

    // ---------------------------
    // Authorization - user access
    // ---------------------------

    @Test
    void onUpdateReceived_userIdFilterEnabled_unauthorizedUser_rejected()
            throws TelegramApiException {
        telegramProps.setEnableAllowUserIDs(true);
        telegramProps.setAllowUserIDs(List.of(999L));

        Update update = mock(Update.class);
        Message message = mock(Message.class);
        Chat chat = mock(Chat.class);
        User user = mock(User.class);

        when(update.hasMessage()).thenReturn(true);
        when(update.getMessage()).thenReturn(message);
        when(message.getChat()).thenReturn(chat);
        when(chat.getType()).thenReturn("private");
        when(chat.getId()).thenReturn(123L);
        when(message.getFrom()).thenReturn(user);
        when(user.getId()).thenReturn(111L);

        doReturn(null).when(bot).execute(any(SendMessage.class));

        bot.onUpdateReceived(update);

        verify(bot)
                .execute(
                        (SendMessage)
                                argThat(
                                        arg -> {
                                            if (arg instanceof SendMessage sm) {
                                                return sm.getText().contains("not authorized");
                                            }
                                            return false;
                                        }));
    }

    @Test
    void onUpdateReceived_userIdFilterEnabled_authorizedUser_proceeds()
            throws TelegramApiException {
        telegramProps.setEnableAllowUserIDs(true);
        telegramProps.setAllowUserIDs(List.of(111L));

        Update update = mock(Update.class);
        Message message = mock(Message.class);
        Chat chat = mock(Chat.class);
        User user = mock(User.class);

        when(update.hasMessage()).thenReturn(true);
        when(update.getMessage()).thenReturn(message);
        when(message.getChat()).thenReturn(chat);
        when(chat.getType()).thenReturn("private");
        when(chat.getId()).thenReturn(123L);
        when(message.getFrom()).thenReturn(user);
        when(user.getId()).thenReturn(111L);
        when(message.hasText()).thenReturn(false);
        when(message.hasDocument()).thenReturn(false);

        doReturn(null).when(bot).execute(any(SendMessage.class));

        bot.onUpdateReceived(update);

        // Should get past authorization and reach the "no valid document" message
        verify(bot)
                .execute(
                        (SendMessage)
                                argThat(
                                        arg -> {
                                            if (arg instanceof SendMessage sm) {
                                                return sm.getText().contains("No valid file");
                                            }
                                            return false;
                                        }));
    }

    @Test
    void onUpdateReceived_userIdFilterEnabled_emptyAllowList_allowsAll()
            throws TelegramApiException {
        telegramProps.setEnableAllowUserIDs(true);
        telegramProps.setAllowUserIDs(new ArrayList<>());

        Update update = mock(Update.class);
        Message message = mock(Message.class);
        Chat chat = mock(Chat.class);
        User user = mock(User.class);

        when(update.hasMessage()).thenReturn(true);
        when(update.getMessage()).thenReturn(message);
        when(message.getChat()).thenReturn(chat);
        when(chat.getType()).thenReturn("private");
        when(chat.getId()).thenReturn(123L);
        when(message.getFrom()).thenReturn(user);
        when(message.hasText()).thenReturn(false);
        when(message.hasDocument()).thenReturn(false);

        doReturn(null).when(bot).execute(any(SendMessage.class));

        bot.onUpdateReceived(update);

        // Empty allow list = allow all, so we should reach "no valid file" message
        verify(bot)
                .execute(
                        (SendMessage)
                                argThat(
                                        arg -> {
                                            if (arg instanceof SendMessage sm) {
                                                return sm.getText().contains("No valid file");
                                            }
                                            return false;
                                        }));
    }

    // ---------------------------
    // Authorization - channel access
    // ---------------------------

    @Test
    void onUpdateReceived_channelIdFilterEnabled_unauthorizedChannel_rejected()
            throws TelegramApiException {
        telegramProps.setEnableAllowChannelIDs(true);
        telegramProps.setAllowChannelIDs(List.of(999L));

        Update update = mock(Update.class);
        Message message = mock(Message.class);
        Chat chat = mock(Chat.class);
        Chat senderChat = mock(Chat.class);

        when(update.hasMessage()).thenReturn(false);
        when(update.hasChannelPost()).thenReturn(true);
        when(update.getChannelPost()).thenReturn(message);
        when(message.getChat()).thenReturn(chat);
        when(chat.getType()).thenReturn("channel");
        when(chat.getId()).thenReturn(123L);
        when(message.getSenderChat()).thenReturn(senderChat);
        when(senderChat.getId()).thenReturn(111L);

        doReturn(null).when(bot).execute(any(SendMessage.class));

        bot.onUpdateReceived(update);

        verify(bot)
                .execute(
                        (SendMessage)
                                argThat(
                                        arg -> {
                                            if (arg instanceof SendMessage sm) {
                                                return sm.getText().contains("not authorized");
                                            }
                                            return false;
                                        }));
    }

    // ---------------------------
    // Authorization - groups always allowed
    // ---------------------------

    @Test
    void onUpdateReceived_groupChat_alwaysAuthorized() throws TelegramApiException {
        telegramProps.setEnableAllowUserIDs(true);
        telegramProps.setEnableAllowChannelIDs(true);

        Update update = mock(Update.class);
        Message message = mock(Message.class);
        Chat chat = mock(Chat.class);

        when(update.hasMessage()).thenReturn(true);
        when(update.getMessage()).thenReturn(message);
        when(message.getChat()).thenReturn(chat);
        when(chat.getType()).thenReturn("group");
        when(chat.getId()).thenReturn(123L);
        when(message.hasText()).thenReturn(false);
        when(message.hasDocument()).thenReturn(false);

        doReturn(null).when(bot).execute(any(SendMessage.class));

        bot.onUpdateReceived(update);

        // Groups are always authorized, so should reach "no valid file"
        verify(bot)
                .execute(
                        (SendMessage)
                                argThat(
                                        arg -> {
                                            if (arg instanceof SendMessage sm) {
                                                return sm.getText().contains("No valid file");
                                            }
                                            return false;
                                        }));
    }

    // ---------------------------
    // handleIncomingFile - unsupported MIME type
    // ---------------------------

    @Test
    void onUpdateReceived_unsupportedMimeType_sendsUnsupportedMessage()
            throws TelegramApiException {
        Update update = mock(Update.class);
        Message message = mock(Message.class);
        Chat chat = mock(Chat.class);
        Document document = mock(Document.class);

        when(update.hasMessage()).thenReturn(true);
        when(update.getMessage()).thenReturn(message);
        when(message.getChat()).thenReturn(chat);
        when(chat.getType()).thenReturn("private");
        when(message.hasText()).thenReturn(false);
        when(message.hasDocument()).thenReturn(true);
        when(message.getDocument()).thenReturn(document);
        when(message.getChatId()).thenReturn(123L);
        when(document.getMimeType()).thenReturn("image/png");

        doReturn(null).when(bot).execute(any(SendMessage.class));

        bot.onUpdateReceived(update);

        verify(bot)
                .execute(
                        (SendMessage)
                                argThat(
                                        arg -> {
                                            if (arg instanceof SendMessage sm) {
                                                return sm.getText()
                                                        .contains("Unsupported MIME type");
                                            }
                                            return false;
                                        }));
    }

    // ---------------------------
    // getBotUsername
    // ---------------------------

    @Test
    void getBotUsername_returnsConfiguredName() {
        assertEquals("test-bot", bot.getBotUsername());
    }

    // ---------------------------
    // channelPost extraction
    // ---------------------------

    @Test
    void onUpdateReceived_channelPost_extractedCorrectly() throws TelegramApiException {
        Update update = mock(Update.class);
        Message message = mock(Message.class);
        Chat chat = mock(Chat.class);

        when(update.hasMessage()).thenReturn(false);
        when(update.hasChannelPost()).thenReturn(true);
        when(update.getChannelPost()).thenReturn(message);
        when(message.getChat()).thenReturn(chat);
        when(chat.getType()).thenReturn("channel");
        when(chat.getId()).thenReturn(789L);
        when(message.hasDocument()).thenReturn(false);

        doReturn(null).when(bot).execute(any(SendMessage.class));

        bot.onUpdateReceived(update);

        // Channel post was extracted and processed (reached no valid doc feedback)
        verify(bot).execute(any(SendMessage.class));
    }

    // ---------------------------
    // handleIncomingFile - null document
    // ---------------------------

    @Test
    void onUpdateReceived_hasDocumentButDocIsNull_sendsNoDocumentMessage()
            throws TelegramApiException {
        Update update = mock(Update.class);
        Message message = mock(Message.class);
        Chat chat = mock(Chat.class);

        when(update.hasMessage()).thenReturn(true);
        when(update.getMessage()).thenReturn(message);
        when(message.getChat()).thenReturn(chat);
        when(chat.getType()).thenReturn("private");
        when(message.hasText()).thenReturn(false);
        when(message.hasDocument()).thenReturn(true);
        when(message.getDocument()).thenReturn(null);
        when(message.getChatId()).thenReturn(123L);

        doReturn(null).when(bot).execute(any(SendMessage.class));

        bot.onUpdateReceived(update);

        verify(bot)
                .execute(
                        (SendMessage)
                                argThat(
                                        arg -> {
                                            if (arg instanceof SendMessage sm) {
                                                return sm.getText().contains("No document found");
                                            }
                                            return false;
                                        }));
    }
}
