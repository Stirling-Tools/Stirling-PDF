# Exception Handling Guide

This guide outlines the common error handling patterns used within Stirling-PDF and provides tips for internationalising error messages. The examples cover the main languages found in the project: Java, JavaScript, HTML/CSS, and a small amount of Python.

## General Principles

- **Fail fast and log clearly.** Exceptions should provide enough information for debugging without exposing sensitive data.
- **Use consistent user messages.** Text shown to users must be pulled from the localisation files so that translations are centrally managed.
- **Avoid silent failures.** Always log unexpected errors and provide the user with a helpful message.

## Java

Java forms the core of Stirling-PDF. When adding new features or handling errors:

1. **Create custom exceptions** to represent specific failure cases. This keeps the code self-documenting and easier to handle at higher levels.
2. **Use `try-with-resources`** when working with streams or other closable resources to ensure clean-up even on failure.
3. **Return meaningful HTTP status codes** in controllers by throwing `ResponseStatusException` or using `@ExceptionHandler` methods.
4. **Log with context** using the project’s logging framework. Include identifiers or IDs that help trace the issue.
5. **Internationalise messages** by placing user-facing text in `messages_en_GB.properties` and referencing them with message keys.

## JavaScript

On the client side, JavaScript handles form validation and user interactions.

- Use `try`/`catch` around asynchronous operations (e.g., `fetch`) and display a translated error notice if the call fails.
- Validate input before sending it to the server and provide inline feedback with messages from the translation files.
- Log unexpected errors to the browser console for easier debugging, but avoid revealing sensitive information.

## HTML & CSS

HTML templates should reserve a space for displaying error messages. Example pattern:

```html
<div class="error" role="alert" th:text="${errorMessage}"></div>
```

Use CSS classes (e.g., `.error`) to style the message so it is clearly visible and accessible. Keep the markup simple to ensure screen readers can announce the error correctly.

## Python

Python scripts in this project are mainly for utility tasks. Follow these guidelines:

- Wrap file operations or external calls in `try`/`except` blocks.
- Print or log errors in a consistent format. If the script outputs messages to end users, ensure they are translatable.

Example:

```python
try:
  perform_task()
except Exception as err:
  logger.error("Task failed: %s", err)
  print(gettext("task.error"))
```

## Internationalisation (i18n)

All user-visible error strings should be defined in the main translation file (`messages_en_GB.properties`). Other language files will use the same keys. Refer to messages in code rather than hard-coding text.

When creating new messages:

1. Add the English phrase to `messages_en_GB.properties`.
2. Reference the message key in your Java, JavaScript, or Python code.
3. Update other localisation files as needed.

Following these patterns helps keep Stirling-PDF stable, easier to debug, and friendly to users in all supported languages.
