# LaTeX PDF Generator

AI-powered document generator using LaTeX. Creates professional documents (invoices, resumes, contracts, etc.) from natural language prompts with conversational editing.

## Features

- 🎨 ChatGPT-like interface with split-screen PDF preview (main window only)
- 📝 Generates LaTeX documents from natural language and compiles to PDF in Docker
- 🔄 Conversational editing with PDF regeneration on every turn
- 💾 Style memory + template reuse per user/team and document type
- 🗂️ Version history with per-iteration PDFs you can reopen
- 📄 Supports: Invoices, Resumes, Contracts, Letters, Reports, poems, proposals, and more

## Quick Start

### Option 1: Docker (Recommended)

```bash
# Build the Docker image
docker build -t latex-generator .

# Run the backend
docker run -p 5000:5000 latex-generator
```

### Option 2: Local Development

#### Backend Setup

```bash
cd backend

# Install Python dependencies
pip install -r requirements.txt

# Install LaTeX (if not already installed)
# On Ubuntu/Debian:
sudo apt-get install texlive-latex-base texlive-latex-extra

# On Mac:
brew install --cask mactex

# On Windows:
# Download and install MiKTeX from https://miktex.org/download

# Run the backend
python app.py
```

Backend will run on `http://localhost:5000`

#### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Run the dev server
npm run dev
```

Frontend will run on `http://localhost:3000`

## Usage

1. Open `http://localhost:3000` in your browser
2. Type a prompt like "Create an invoice for web development services"
3. The AI generates LaTeX code and compiles it to PDF
4. Continue chatting to refine the document
5. Download the final PDF

## Example Prompts

- "Create a professional invoice for $1,500 in consulting services"
- "Generate a resume for a senior software engineer with 5 years experience"
- "Make a business letter to a client about project completion"
- "Create a contract for freelance web development"

## Configuration

### OpenAI API (Optional)

To use real AI generation instead of mock templates:

1. Copy `.env.example` to `.env`
2. Add your OpenAI API key: `OPENAI_API_KEY=sk-...`
3. (Optional) Choose models:
   - Smart (full generation): `SMART_MODEL=gpt-5.1` (default)
   - Fast (intent/pre checks): `FAST_MODEL=gpt-4.1-nano` (default)
3. (Legacy SDK) We pin `openai==0.28.1` in Docker to avoid client init issues. No code changes needed.

## Project Structure

```
latex-pdf-generator/
├── frontend/          # React + TypeScript + Tailwind
│   ├── src/
│   │   ├── components/
│   │   │   ├── landing/         # Landing hero + CTA
│   │   │   ├── modals/          # Reusable modal(s)
│   │   │   ├── workspace/       # Chat panel, preview, history
│   │   │   └── ui/              # Buttons, button groups, etc.
│   │   ├── hooks/               # Workflow + speech capture hooks
│   │   ├── types/               # Shared TypeScript interfaces
│   │   ├── App.tsx              # Thin orchestrator
│   │   └── main.tsx
│   ├── .eslintrc.cjs            # ESLint config (React + TS)
│   ├── package.json
│   └── vite.config.ts
├── backend/           # Flask + LaTeX
│   ├── app.py                   # Routes + Flask app factory
│   ├── ai_generation.py         # OpenAI + mock generation helpers
│   ├── briefs.py                # Guided brief collection utilities
│   ├── config.py                # Logging + environment setup
│   ├── document_types.py        # Doc-type heuristics
│   ├── latex_utils.py           # LaTeX sanitizers + layout helpers
│   ├── pdf_utils.py             # PDF compilation + render helpers
│   ├── storage.py               # JSON persistence for users/templates
│   ├── styles.py                # Style preference heuristics
│   ├── vision.py                # Layout extraction via multimodal GPT
│   ├── requirements.txt
│   └── data/          # User style storage
├── Dockerfile
└── README.md
```

### Linting

The frontend now ships with ESLint + TypeScript rules that keep the new modular structure tidy:

```bash
cd frontend
npm run lint
```

Backend linting can be added with your preferred tool (e.g., ruff or flake8) by pointing it at the new small modules in `backend/`.

## Troubleshooting

### LaTeX compilation fails

- Ensure `pdflatex` is in your PATH
- Check logs in the backend console
- Verify LaTeX packages are installed

### CORS errors

- Make sure both frontend and backend are running
- Frontend proxy is configured in `vite.config.ts`

### PDF not displaying

- Check browser console for errors
- Ensure the backend `/output` endpoint is accessible
- Try opening the PDF URL directly

## Development

### Mock Mode (Current)

The app currently uses mock LaTeX templates for quick testing. To enable real AI:

1. Get an OpenAI API key
2. Set `OPENAI_API_KEY` and optionally override:
   - `SMART_MODEL` (default `gpt-5.1`)
   - `FAST_MODEL` (default `gpt-4.1-nano`)
3. Restart the backend; it auto-detects whether to call the live model or the bundled mock templates

## License

MIT
