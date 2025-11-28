/**
 * Builds HTML for OAuth callback pages with i18n and dark mode support
 */

interface OAuthCallbackHtmlOptions {
  title: string;
  message: string;
  isError?: boolean;
  errorPlaceholder?: boolean;
}

/**
 * Generates OAuth callback HTML with automatic dark mode support
 */
export function buildOAuthCallbackHtml({
  title,
  message,
  isError = false,
  errorPlaceholder = false,
}: OAuthCallbackHtmlOptions): string {
  const iconColor = isError ? '#d32f2f' : '#2e7d32';
  const iconColorDark = isError ? '#ef5350' : '#66bb6a';
  const icon = isError ? '✗' : '✓';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      text-align: center;
      padding: 50px 20px;
      background: #f5f5f5;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .container {
      background: white;
      border-radius: 12px;
      padding: 40px;
      max-width: 420px;
      width: 100%;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .icon {
      font-size: 48px;
      margin-bottom: 16px;
      color: ${iconColor};
    }

    h1 {
      font-size: 24px;
      font-weight: 600;
      margin-bottom: 12px;
      color: #1a1a1a;
    }

    p {
      color: #666;
      line-height: 1.6;
      font-size: 15px;
    }

    ${errorPlaceholder ? `
    .error-details {
      background: #ffebee;
      border: 1px solid #ffcdd2;
      padding: 16px;
      border-radius: 8px;
      margin-top: 20px;
      font-size: 14px;
      color: #c62828;
      word-break: break-word;
      text-align: left;
      line-height: 1.5;
    }
    ` : ''}

    /* Dark mode support */
    @media (prefers-color-scheme: dark) {
      body {
        background: #1a1a1a;
        color: #e0e0e0;
      }

      .container {
        background: #2d2d2d;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      }

      .icon {
        color: ${iconColorDark};
      }

      h1 {
        color: #f5f5f5;
      }

      p {
        color: #b0b0b0;
      }

      ${errorPlaceholder ? `
      .error-details {
        background: #3d2020;
        border: 1px solid #5d3030;
        color: #ef9a9a;
      }
      ` : ''}
    }

    /* Mobile responsive */
    @media (max-width: 480px) {
      body {
        padding: 20px 16px;
      }

      .container {
        padding: 32px 24px;
      }

      h1 {
        font-size: 20px;
      }

      .icon {
        font-size: 40px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">${icon}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    ${errorPlaceholder ? '<div class="error-details">{error}</div>' : ''}
  </div>
</body>
</html>`;
}
