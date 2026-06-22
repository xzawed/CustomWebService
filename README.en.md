# ⚡ CustomWebService

> An all-in-one AI-powered no-code platform: pick free APIs, describe your service, and AI generates and instantly publishes a web app to your own subdomain.

[![license](https://img.shields.io/badge/license-Proprietary-red?style=flat-square)](./README.md#license)
[![status](https://img.shields.io/badge/status-v1.0.0%20Live-brightgreen?style=flat-square)](https://xzawed.xyz)
[![Next.js](https://img.shields.io/badge/Next.js-16+-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![AI](https://img.shields.io/badge/AI-Claude%20Opus%204.7-blueviolet?style=flat-square)](https://anthropic.com)
[![Tests](https://img.shields.io/badge/Vitest-1917%20listed-success?style=flat-square)](./docs/guides/testing.md)
[![Coverage](https://img.shields.io/badge/Coverage-85%25%2B-yellow?style=flat-square)](./docs/guides/testing.md)
[![Deploy](https://img.shields.io/badge/Deploy-Railway-8A2BE2?style=flat-square&logo=railway)](https://railway.app)

**🌐 Live**: [xzawed.xyz](https://xzawed.xyz) &nbsp;|&nbsp; 🇰🇷 [한국어](./README.md)

---

## 📖 Overview

CustomWebService lets anyone — without coding knowledge — build and publish their own web service in minutes.

1. 🗂️ **Pick APIs** — Browse a curated catalog of free public APIs
2. ✍️ **Describe your service** — Explain what you want to build in plain language
3. 🚀 **AI generates & publishes** — AI writes the full web page and serves it at `slug.xzawed.xyz`

### ✨ Features

| Feature | Description |
|---------|-------------|
| 🗃️ API Catalog | Browse and search free APIs by category |
| 🔀 Dual Builder Modes | API-First or Context-First creation workflows |
| 🤖 AI Code Generation | Claude API-powered generation with security validation and quality scoring |
| 🧭 Relevance Gate | Haiku-based mismatch detection before generation — pre-fills options or offers 3-way resolution |
| 📐 Template Library | 11 official templates (dashboard, gallery, map, etc.) — layout structure injected into AI prompt |
| 🎨 Design Preferences | Choose mood, target audience, and layout style; AI pre-selects recommended values |
| 🌐 Subdomain Publishing | Instantly published at `slug.xzawed.xyz` |
| 📊 Dashboard | Project management, version rollback, publish/unpublish |
| 📱 Live Preview | Device preview (mobile / tablet / desktop) |
| 🔄 Re-generation | Refine and improve code with natural language feedback |
| 🌈 UI Themes | 6 color themes |

---

## 🏗️ Architecture Highlights

### 🤖 AI Code Generation Pipeline

```
🔍 Stage 0 (Feature Extraction)  — Haiku + tool_use extracts feature spec → injected into Stage 1 prompt
         ↓
🏗️ Stage 1 (Structure & Logic)   — Generates real API fetch calls, mobile-first, security rules applied  (0→30%)
         ↓  conditional: missing fetch / placeholder / hardcoded array / no-proxy, or Fast QC fail
✅ Stage 2 (Validation)           — AI self-reviews and fixes Stage 1 output                            (30→65%)
         ↓  conditional: structural score < 80 or mobile score < 70
🎨 Stage 3 (Design)               — Category-based theme injection (finance→modern-dark, weather→ocean-blue) (65→85%)
         ↓
🔁 Quality Loop                   — Default 2 retries (up to 3), best-of-n selection
         ↓
⚡ Fast QC                        — Playwright rendering check (console errors, horizontal scroll, footer visibility, layout overlap, runtime placeholder)
         ↓
🔬 Deep QC                        — Interaction, network, accessibility, responsive, touch-target validation (async, optional)
```

### ⚙️ Key Design Patterns

| Pattern | Implementation | Purpose |
|---------|---------------|---------|
| 🧠 **Model Tiering** | Opus 4.7 (generation) / Haiku 4.5 (recommendations) | Cost optimization |
| 💾 **Prompt Caching** | `cache_control: ephemeral` | Reduce repeated input token costs |
| 🤔 **Conditional Extended Thinking** | Complexity scoring (API count · auth type · endpoints · context · payment signals, 35pt threshold) | Spend reasoning budget only on complex requests |
| 📡 **EventBus** | 17 domain events, pub/sub + auto DB audit log | Separation of concerns |
| ⚛️ **Atomic Rate Limiting** | `UPDATE WHERE count < limit RETURNING` | Prevent race conditions on concurrent requests |
| 🔌 **Circuit Breaker** | 3 failures → TRIPPED, 60s recovery probe | Contain DB failure propagation |
| 📶 **SSE + Polling Fallback** | `visibilitychange` triggers polling switch | Mobile background tab handling |

---

## 🔒 Security

> AI-generated code is untrusted by default. All output is validated server-side.

**🛡️ Static Analysis of AI Output**
- Blocks `eval()` (rejects generation); flags `document.write()` and direct `innerHTML` assignment as warnings
- Detects hardcoded API key patterns (OpenAI, Stripe, Google, GitHub, Slack, AWS)
- Blocks CSS XSS vectors: `expression()`, `url(javascript:)`, `-moz-binding:`

**🏰 Infrastructure Security**
- Proxy SSRF protection: blocks loopback (127.0.0.1/::1), RFC1918 private IPs (10.x/172.16-31.x/192.168.x), AWS metadata endpoint (169.254.169.254)
- CSP, HSTS, X-Frame-Options applied globally in `middleware.ts`
- User API keys encrypted with AES-256-GCM
- OAuth PKCE flow (Google, GitHub)
- `X-Correlation-Id` header for request tracing

---

## 🛠️ Tech Stack

| Area | Technology |
|------|-----------|
| 🖥️ Framework | Next.js 16+ (App Router, TypeScript strict) |
| 🎨 UI | React 19, Tailwind CSS 4, Lucide React |
| 🗄️ State | Zustand (split stores + persist middleware) |
| 📝 Forms | React Hook Form + Zod |
| 🗃️ Database | Supabase (default) / on-prem PostgreSQL + Drizzle ORM (optional) |
| 🔐 Auth | Supabase Auth (default) / Auth.js v5 + NextAuth (optional) |
| 🤖 AI | Claude API (Anthropic SDK, claude-opus-4-7 default) |
| 🧪 Testing | Vitest, happy-dom, MSW, Playwright |
| ⚙️ CI/CD | GitHub Actions → lint → type-check → test → build (Railway auto-deploy on push) |
| 📦 Package Manager | pnpm |

---

## 📁 Project Structure

```
src/
├── app/
│   ├── api/v1/          # 🔌 REST API route.ts files (28)
│   ├── (auth)/          # 🔐 Auth pages
│   ├── (main)/          # 🏠 Main pages (builder, catalog, dashboard)
│   └── site/[slug]/     # 🌐 Subdomain serving
├── components/          # 🧩 UI components (builder, catalog, dashboard, layout, settings, ui)
├── lib/
│   ├── ai/              # 🤖 Pipeline orchestrator, stageRunner, qualityLoop, featureExtractor
│   ├── catalog/         # 🩺 API catalog health/key checks (healthCheck, keyCheck)
│   ├── events/          # 📡 EventBus (pub/sub) + eventPersister (auto DB audit log)
│   ├── qc/              # 🔬 Playwright rendering QC (Fast/Deep), browserPool
│   ├── config/          # ⚙️ Environment-variable-driven business rules
│   └── utils/           # 🔧 Error classes, encryption, logger
├── providers/ai/        # 🔀 IAiProvider → ClaudeProvider (swappable interface)
├── repositories/        # 💾 Data access layer (BaseRepository pattern)
├── services/            # ⚡ Business logic layer
├── templates/           # 📐 11 code generation templates + TemplateRegistry
└── types/               # 📋 Zod shared schemas, domain types, event types
```

---

## 🧪 Testing

| Item | Details |
|------|---------|
| ✅ Test inventory | **1,917 Vitest tests (148 files) + 33 Playwright tests** (`vitest list`, `playwright test --list`) |
| 🔬 Unit tests | Vitest + happy-dom — AI pipeline, security validation, rate limiting, Circuit Breaker |
| 🔗 Integration tests | Vitest + MSW — API route auth, input validation, permissions, business logic |
| 🌐 E2E tests | Playwright — 3 device types (mobile · tablet · desktop) |
| 📊 Coverage | **85%+ lines** for `lib/services/providers/repositories/components`; CI thresholds are lower guardrails |

```bash
pnpm test              # Run all tests
pnpm test:coverage     # Coverage report
pnpm test:e2e          # Playwright E2E
```

---

## 💻 Development Commands

```bash
pnpm dev               # 🔥 Dev server (Turbopack)
pnpm build             # 📦 Production build
pnpm type-check        # 🔍 TypeScript type check
pnpm lint              # 🔎 ESLint check
pnpm lint:fix          # 🔧 ESLint auto-fix
pnpm test              # ✅ Run all tests
pnpm test:coverage     # 📊 Coverage report
```

---

## ☁️ Infrastructure

| Item | Configuration |
|------|--------------|
| 🚂 Hosting | Railway (virtual subdomain hosting, Docker standalone) |
| 🗃️ Database | Supabase (default, PostgreSQL + RLS) / on-prem PostgreSQL (env-var switchable) |
| 🔐 Auth | Supabase Auth (default, OAuth 2.0) / Auth.js v5 (env-var switchable) |
| 🤖 AI | Claude API (server-side only) |
| 🌐 Domain | Railway custom domain |

Provider migration guide: [docs/decisions/provider-migration.md](docs/decisions/provider-migration.md)

---

## 📄 License

Copyright © 2026 xzawed. All rights reserved.
