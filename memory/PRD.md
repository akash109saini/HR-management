# HRMS 2026 - Multi-Tenant HR Management SaaS

## Architecture (CURRENT STATE)
| Layer | Technology | Port | Status |
|-------|-----------|------|--------|
| Core HR Backend | Python FastAPI | 8001 | ✅ Running |
| AI Engine | Python FastAPI routes (/api/ai/*) | 8001 | ✅ Running |
| NestJS Backend | Node.js NestJS | 8002 | ✅ Running |
| Frontend | React (CRA) | 3000 | ✅ Running |
| Database | MongoDB | 27017 | ✅ Running |
| WhatsApp | Meta Business API | — | 🔑 Needs API key |
| Blockchain | Ethereum Sepolia | — | 🔑 Needs Alchemy key |

## NestJS Backend (/app/nestjs-backend)
Built modules: Auth, Employees, Tenants, Leaves, Attendance, Payroll, Announcements, Dashboard, WhatsApp, Blockchain, AI (delegates to Python)
Port: 8002
Build: yarn build (compiled to dist/)

## AI Features (Live on port 8001)
- /api/ai/chat - HR Chatbot (GPT-4.1-mini)
- /api/ai/attrition-risk/:id - Attrition risk prediction
- /api/ai/sentiment - Sentiment analysis
- /api/ai/parse-resume - Resume parser with blind hiring
- /api/ai/career-path/:id - Career path suggestions

## Pending (Need External Keys)
- WhatsApp: Set WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID in /app/nestjs-backend/.env
- Blockchain: Set ALCHEMY_API_KEY + ETHEREUM_PRIVATE_KEY in /app/nestjs-backend/.env

## Key Files
- /app/backend/server.py - Python FastAPI main
- /app/backend/routes/ai_routes.py - AI engine
- /app/nestjs-backend/src/main.ts - NestJS main
- /app/nestjs-backend/src/whatsapp/ - WhatsApp module
- /app/nestjs-backend/src/blockchain/ - Blockchain module
- /app/frontend/src/pages/AIAssistantPage.js - AI UI
