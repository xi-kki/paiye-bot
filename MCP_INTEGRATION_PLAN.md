# 🚀 Paiye Bot — MCP Integration Plan

## Overview
Transform Paiye from a basic job scraper into an **AI-powered career agent** with MCP integrations for every job type.

---

## 🎯 MCPs by Job Category

### 1. 🔍 General Job Search MCPs

| MCP | Source | What It Does | Priority |
|-----|--------|--------------|----------|
| **JobSpy MCP** | `borgius/jobspy-mcp-server` | Scrapes LinkedIn, Indeed, Google, ZipRecruiter, Glassdoor, etc. | 🔥🔥🔥 |
| **Remote Jobs MCP** | `himalayas.app/mcp` | Himalayas, RemoteOK, WeWorkRemotely, Remotive | 🔥🔥🔥 |
| **LinkedIn Jobs MCP** | `ghoshsrinjoy/linkedin-job-mcp` | Direct LinkedIn job search | 🔥🔥🔥 |
| **LinkedIn Career MCP** | `mperkhou/linkedin-career-mcp` | Career path analysis | 🔥🔥 |

### 2. 💻 Developer/Tech Jobs

| MCP | Source | What It Does | Priority |
|-----|--------|--------------|----------|
| **GitHub MCP** | `github/github-mcp-server` | Match jobs to repos, find dev roles | 🔥🔥🔥 |
| **Stack Overflow Jobs** | Custom scraper | Developer-focused positions | 🔥🔥 |
| **Hacker News "Who's Hiring"** | Custom scraper | Startup/tech jobs | 🔥🔥 |

### 3. ✍️ Content/Writing Jobs

| MCP | Source | What It Does | Priority |
|-----|--------|--------------|----------|
| **Contently MCP** | Custom | Content platform jobs | 🔥🔥 |
| **Medium/Substack Jobs** | Custom scraper | Writing platform opportunities | 🔥🔥 |

### 4. 📊 Data/AI Jobs

| MCP | Source | What It Does | Priority |
|-----|--------|--------------|----------|
| **Kaggle MCP** | Custom | Data science competitions + jobs | 🔥🔥 |
| **HuggingFace Jobs** | Custom | AI/ML positions | 🔥🔥 |

### 5. 📅 Calendar/Scheduling

| MCP | Source | What It Does | Priority |
|-----|--------|--------------|----------|
| **Google Calendar MCP** | `nspady/google-calendar-mcp` | Schedule interviews | 🔥🔥🔥 |
| **Outlook Calendar MCP** | Custom | Enterprise scheduling | 🔥🔥 |

### 6. 📧 Email/Application

| MCP | Source | What It Does | Priority |
|-----|--------|--------------|----------|
| **Gmail MCP** | `google/gmail-mcp` | Send applications, follow-ups | 🔥🔥🔥 |
| **Resend MCP** | `resend/mcp` | Transactional email | 🔥🔥 |

### 7. 🏢 Company Research

| MCP | Source | What It Does | Priority |
|-----|--------|--------------|----------|
| **Crunchbase MCP** | Custom | Funding, company size, growth | 🔥🔥 |
| **Glassdoor MCP** | Custom | Salary data, reviews | 🔥🔥 |
| **LinkedIn Company MCP** | Custom | Company insights | 🔥🔥 |

### 8. 📝 Resume/Documents

| MCP | Source | What It Does | Priority |
|-----|--------|--------------|----------|
| **Google Docs MCP** | `google/google-docs-mcp` | Generate tailored resumes | 🔥🔥🔥 |
| **Notion MCP** | `notion/mcp` | Job application tracker | 🔥🔥 |

### 9. 🔔 Notifications

| MCP | Source | What It Does | Priority |
|-----|--------|--------------|----------|
| **Telegram Channel MCP** | Custom | Broadcast to public channels | 🔥🔥🔥 |
| **Slack MCP** | `slack/mcp` | Post to Slack channels | 🔥🔥 |
| **Discord MCP** | Custom | Community job posts | 🔥🔥 |

---

## 🏗️ Implementation Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    PAIYE BOT (Node.js)                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │  Job Search  │  │  Calendar   │  │   Email     │        │
│  │    Layer     │  │   Layer     │  │   Layer     │        │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │
│         │                │                │                 │
│  ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐        │
│  │   JobSpy    │  │  Google     │  │   Gmail     │        │
│  │   LinkedIn  │  │  Calendar   │  │   Resend    │        │
│  │   GitHub    │  │  Outlook    │  │             │        │
│  │   Remote    │  │             │  │             │        │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │
│         │                │                │                 │
│  ┌──────▼────────────────▼────────────────▼──────┐        │
│  │              MCP Client Layer                  │        │
│  │         (stdio / HTTP transport)               │        │
│  └───────────────────────┬───────────────────────┘        │
│                          │                                 │
│  ┌───────────────────────▼───────────────────────┐        │
│  │           AI Processing Layer                  │        │
│  │      (Groq / Claude / GPT for analysis)        │        │
│  └───────────────────────┬───────────────────────┘        │
│                          │                                 │
│  ┌───────────────────────▼───────────────────────┐        │
│  │           Telegram Bot API                     │        │
│  │         (commands, keyboards, chat)            │        │
│  └───────────────────────────────────────────────┘        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 📋 Implementation Phases

### Phase 1: Core Job Search (Week 1)
- [ ] Install JobSpy MCP (covers LinkedIn, Indeed, Google, ZipRecruiter)
- [ ] Install Remote Jobs MCP (Himalayas, RemoteOK, WeWorkRemotely)
- [ ] Create MCP client wrapper in `mcpClient.js`
- [ ] Add `/mcp-search` command for unified search
- [ ] Test with existing AI profiles

### Phase 2: Calendar & Email (Week 2)
- [ ] Install Google Calendar MCP
- [ ] Install Gmail MCP
- [ ] Add `/schedule` command for interview scheduling
- [ ] Add `/apply` command for auto-sending applications
- [ ] OAuth flow for Google account

### Phase 3: Company Research (Week 3)
- [ ] Build Crunchbase scraper (or find MCP)
- [ ] Build Glassdoor scraper (or find MCP)
- [ ] Add `/company <name>` command
- [ ] Integrate with job cards (show company info)

### Phase 4: Resume & Documents (Week 4)
- [ ] Install Google Docs MCP
- [ ] Install Notion MCP
- [ ] Add `/generate-resume` command
- [ ] Add `/track` command for application tracking
- [ ] Auto-generate tailored resumes per job

### Phase 5: Notifications & Broadcast (Week 5)
- [ ] Create Telegram Channel broadcaster
- [ ] Add `/broadcast` command (admin only)
- [ ] Add Slack webhook integration
- [ ] Add Discord webhook integration

---

## 🔧 MCP Client Implementation

### `mcpClient.js` — Unified MCP Client

```javascript
// MCP Client for Paiye Bot
// Wraps multiple MCP servers into a unified interface

const { spawn } = require('child_process');

class MCPClient {
  constructor() {
    this.servers = new Map();
  }

  // Connect to an MCP server via stdio
  async connect(name, command, args = []) {
    const server = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    this.servers.set(name, {
      process: server,
      pending: new Map()
    });
    
    // Handle responses
    server.stdout.on('data', (data) => {
      this.handleResponse(name, data);
    });
    
    return this;
  }

  // Call a tool on an MCP server
  async callTool(serverName, toolName, args = {}) {
    const server = this.servers.get(serverName);
    if (!server) throw new Error(`Server ${serverName} not connected`);
    
    const request = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args
      }
    };
    
    return new Promise((resolve, reject) => {
      server.pending.set(request.id, { resolve, reject });
      server.process.stdin.write(JSON.stringify(request) + '\n');
    });
  }

  // Handle response from MCP server
  handleResponse(name, data) {
    const server = this.servers.get(name);
    const response = JSON.parse(data.toString());
    
    if (response.id && server.pending.has(response.id)) {
      const { resolve } = server.pending.get(response.id);
      server.pending.delete(response.id);
      resolve(response.result);
    }
  }

  // Disconnect all servers
  disconnect() {
    for (const [name, server] of this.servers) {
      server.process.kill();
    }
    this.servers.clear();
  }
}

module.exports = MCPClient;
```

---

## 🎮 New Commands

### `/mcp-search <query>`
Search across ALL connected job boards simultaneously.

```
/mcp-search senior AI engineer remote

🔍 Searching 8 job boards...
📊 Found 47 matches

Top 5:
1. 🟢 Senior ML Engineer — OpenAI (95% match)
2. 🟢 AI Research Scientist — DeepMind (92% match)
3. 🟡 ML Engineer — Stripe (88% match)
...
```

### `/schedule <job-url>`
Schedule an interview reminder.

```
/schedule https://linkedin.com/jobs/12345

📅 Interview Scheduler

When is your interview?
• /today — Today
• /tomorrow — Tomorrow
• /date <YYYY-MM-DD> — Custom date

I'll remind you 1 hour before!
```

### `/apply <job-url>`
Auto-generate and send application.

```
/apply https://linkedin.com/jobs/12345

📧 Auto-Apply

Generating tailored resume and cover letter...
✅ Resume: tailored-resume.pdf
✅ Cover Letter: cover-letter.txt

Send to: hiring@company.com?
• /confirm — Send now
• /edit — Make changes
• /cancel — Don't send
```

### `/company <name>`
Research a company.

```
/company OpenAI

🏢 OpenAI

📊 Company Info:
• Founded: 2015
• Employees: 2,000+
• Funding: $13B+ (Series C)
• HQ: San Francisco, CA

💰 Salary Range:
• Software Engineer: $150k-$350k
• ML Engineer: $180k-$400k
• Research Scientist: $200k-$500k

⭐ Glassdoor: 4.2/5 (1,200 reviews)
📝 Recent News: [link]

Apply? /apply <job-url>
```

### `/track`
Application tracker.

```
/track

📋 Your Applications

| # | Company | Role | Status | Applied |
|---|---------|------|--------|---------|
| 1 | OpenAI | ML Engineer | 🟡 Interview | 2 days ago |
| 2 | Google | SWE | 📤 Applied | 5 days ago |
| 3 | Stripe | PM | 📝 Draft | — |

Add: /track-add <job-url>
Update: /track-update <#> <status>
```

---

## 📊 Job Type Coverage

| Job Type | Current Sources | With MCPs |
|----------|-----------------|-----------|
| **AI/ML** | RemoteOK, Himalayas | + LinkedIn, Indeed, Google, Kaggle |
| **Writing** | RemoteOK, Himalayas | + LinkedIn, Contently, Medium |
| **Data** | RemoteOK, Himalayas | + LinkedIn, Indeed, Kaggle |
| **Dev** | RemoteOK, Himalayas | + GitHub, StackOverflow, HN |
| **Design** | RemoteOK | + LinkedIn, Dribbble, Behance |
| **Marketing** | RemoteOK | + LinkedIn, Indeed, Glassdoor |
| **Sales** | RemoteOK | + LinkedIn, Indeed, ZipRecruiter |
| **Finance** | RemoteOK | + LinkedIn, Indeed, Glassdoor |

---

## 🎯 Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Job sources | 6 | 15+ |
| Jobs per search | 20-50 | 100-200 |
| Company intel | ❌ | ✅ |
| Interview scheduling | ❌ | ✅ |
| Auto-apply | ❌ | ✅ |
| Application tracking | ❌ | ✅ |
| Resume tailoring | ✅ (basic) | ✅ (pro) |

---

## 🚀 Next Steps

1. **This session**: Install JobSpy MCP + LinkedIn MCP
2. **Next session**: Google Calendar + Gmail MCP
3. **Week 2**: Company research integration
4. **Week 3**: Application tracking
5. **Week 4**: Auto-apply feature

---

*Last updated: 2026-07-13*
*Author: Isaac & Pi*
