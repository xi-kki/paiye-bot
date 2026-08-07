# 🤖 Paiye Bot (@Paiye_Bot)

AI-powered career agent on Telegram. Finds jobs, analyzes resumes, and chats about anything — all powered by Groq AI.

## Features

- **🔍 Job Search** — Scrapes 10+ remote job boards with AI-powered matching
- **📄 Resume Analysis** — Upload your resume for ATS optimization tips
- **💬 AI Chat** — Ask anything about careers, jobs, or interview prep
- **🌍 Remote Jobs** — Dedicated remote job search with salary filtering
- **🇳🇬 Nigeria Jobs** — Local job search for Nigerian market
- **📈 Trending** — See what's hot in the job market
- **🎯 Smart Matching** — AI confidence scores for job relevance
- **⏰ Daily Delivery** — Subscribe for 7AM WAT job updates
- **🔒 Compliance** — Rate limiting, platform rules, and anti-abuse measures

## Commands

| Command | Description |
|---------|-------------|
| `/find <query>` | Search jobs by keyword |
| `/remote` | Browse remote jobs |
| `/nigeria` | Browse Nigerian jobs |
| `/trending` | See trending jobs |
| `/resume` | Upload resume for analysis |
| `/analyze` | Analyze uploaded resume |
| `/ai <question>` | Chat with AI about careers |
| `/interview` | Practice interview questions |
| `/tailor` | Tailor resume to a job description |
| `/subscribe` | Get daily job updates at 7AM WAT |

## Tech Stack

- **Runtime:** Node.js
- **Telegram:** Custom client (no 409 conflicts)
- **AI:** Groq (Llama 3.3 70B), Claude, GPT
- **Job Sources:** Indeed, LinkedIn, RemoteOK, We Work Remotely, Jobberman, NGcareers + **AI Training & Data Platforms** (Scale AI, Turing, Surge AI, Handshake, Encord, Toloka, Labelbox, Snorkel, Truveta, Fleet, AfterQuery, Mechanize, Hud, Arena, David AI, Protege, Cortex — live ATS feeds; Mercor, micro1, Bespoke Labs, DeepFrame, Sepal AI, Plato, DataCurve, Argilla — career-page links)
- **Features:** MCP search, compliance manager, rate limiter, job cache

## Setup

```bash
# Clone
git clone https://github.com/xi-kki/telegram-bot.git
cd telegram-bot

# Install
npm install

# Configure
cp .env.example .env
# Add your TELEGRAM_TOKEN, GROQ_API_KEY, etc.

# Run
node index.js
```

## Environment Variables

```
TELEGRAM_TOKEN=your_telegram_bot_token
GROQ_API_KEY=your_groq_api_key
ANTHROPIC_API_KEY=your_anthropic_key  # optional
OPENAI_API_KEY=your_openai_key        # optional
```

## Architecture

```
├── index.js              — Main bot entry, command routing
├── paiye.js              — Extended features, cron jobs
├── jobEngine.js          — Core job scraping engine
├── jobMcp.js             — MCP-powered cross-platform search
├── complianceManager.js  — Platform compliance & anti-abuse
├── rateLimiter.js        — Per-user rate limiting
├── aiChat.js             — Groq/Claude/GPT chat integration
├── telegramClient.js     — Custom Telegram client (no conflicts)
├── resumeParser.js       — PDF resume parsing
├── companyResearch.js    — Company intelligence
└── profiles.js           — User profiles & preferences
```

## License

MIT
