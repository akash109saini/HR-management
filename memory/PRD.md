# HRMS 2026 - Multi-Tenant HR Management SaaS

## Architecture (CURRENT STATE)
| Layer | Technology | Port | Status |
|-------|-----------|------|--------|
| Core HR Backend | Python FastAPI | 8001 | ✅ Running |
| AI Engine (chat / sentiment / attrition / parse-resume / career) | FastAPI `/api/ai/*` | 8001 | ✅ Running |
| WhatsApp (Meta Cloud API) | FastAPI `/api/whatsapp/*` | 8001 | ✅ Running (dev mode — recipients need allow-listing) |
| Blockchain (Ethereum Sepolia) | FastAPI `/api/blockchain/*` | 8001 | ✅ Running (0 ETH; off-chain signing fully working, anchoring pending faucet) |
| Biometric (eSSL/ZKTeco ADMS) | FastAPI `/api/iclock/*` + `/api/biometric/*` | 8001 | ✅ Running (simulator working, ready for physical MB160) |
| Demo Seeder | FastAPI `/api/demo/*` | 8001 | ✅ Running (Super Admin only) |
| NestJS Backend | Node.js NestJS | 8002 | 🚧 Scaffolded, unused |
| Frontend | React (CRA) | 3000 | ✅ Running |
| Database | MongoDB | 27017 | ✅ Running |

## Live Features
### Authentication
- JWT cookies + Bearer header (auto-attach interceptor)
- Master Password (`SuperAdmin@123`) — Super Admin can log into any tenant
- Password reset + eye buttons

### AI (Emergent LLM Key, GPT-4.1-mini)
- `/api/ai/chat`, `/api/ai/sentiment`, `/api/ai/attrition-risk/:id`, `/api/ai/parse-resume`, `/api/ai/career-path/:id`
- `/api/ai/feedback` — submit feedback with auto-sentiment analysis
- `/api/ai/sentiment-dashboard` (HR) — aggregated stats: distribution, themes, emotions, action items, trend, recent
- `/api/ai/feedbacks` (HR) — list raw feedbacks

### WhatsApp (Meta Cloud API)
- Backend: webhook verify/receive/send/broadcast/messages/status
- Frontend `/whatsapp-admin` (HR): Send Message / Broadcast / History tabs
- Inbound bot routing (leave balance / payslip / apply leave / profile / help) works fully
- Outbound currently fails for non-whitelisted numbers — Meta restriction in dev mode

### Blockchain Credentials (Ethereum Sepolia)
- SHA-256 + EIP-191 sign (gas-free)
- Issue / Verify / Get-by-UID / List / Anchor (gated by balance) / Revoke
- Frontend `/blockchain-credentials`: List / Issue / Verify tabs with status strip, faucet links

### Biometric (eSSL MB160 / ZKTeco ADMS)
- Device-facing eSSL Push Protocol:
  - `GET /api/iclock/cdata?SN=…` — handshake returns config block
  - `POST /api/iclock/cdata?SN=…&table=ATTLOG` — receives punches
  - `GET /api/iclock/getrequest?SN=…` — device polls for queued commands
  - `POST /api/iclock/devicecmd?SN=…` — device acks commands
- Admin endpoints: devices CRUD, punches list, simulate, queue-command, setup-guide, status
- Frontend `/biometric-devices`: Devices / Live Punches / Simulator / Setup Guide tabs (auto-refresh 10s)
- Punches auto-sync to attendance collection (compatible with existing schema: `user_id`, `clock_in`, `clock_out`)
- Unknown SN → device auto-registers as 'pending' for HR to claim

### Sentiment / Pulse
- Frontend `/sentiment-dashboard` — feedback form (all roles) + HR analytics
- Stats: total, avg score, action-needed, sentiment breakdown bar, top themes, top emotions, action-required items with AI-suggested actions, recent feed
- Anonymous toggle for safe employee feedback

### Predictive Attrition (HR)
- Frontend `/attrition-dashboard` — list of all tenant employees with one-click Analyze (per-employee LLM scoring)
- Color-coded risk levels (low/medium/high/critical), score, key factors, recommended actions
- Summary cards: total employees, analyzed count, avg risk, high-risk count

### Demo Seeder (Super Admin)
- Frontend `/demo-seeder` — Seed/Refresh/Remove buttons
- POST `/api/demo/seed` adds 12 feedbacks + 6 credentials + 16 WA msgs + 3 announcements (cumulative across runs)
- DELETE `/api/demo/seed` removes all `demo:true` tagged docs

## Schemas (MongoDB)
- `users`, `tenants`, `settings`
- `whatsapp_messages`, `whatsapp_webhooks`
- `credentials` — blockchain-signed credentials
- `feedbacks` — sentiment-analyzed employee feedback
- `biometric_devices` — `{device_id, serial_number, name, location, tenant_id, status, online, last_ping, ...}`
- `biometric_punches` — `{punch_id, device_sn, user_pin, employee_id, employee_name, timestamp, status, verify_mode, matched, ...}`
- `biometric_commands` — pending device commands
- `biometric_raw_pushes` — raw push body debug log
- `attendance` — uses `user_id`, `user_name`, `clock_in`, `clock_out`, `source`, `device_sn`

## Tests (iteration_8.json)
- Backend: 41/41 passed (18 new + 23 regression) — 100%
- Frontend: 100% (all 5 new pages verified visually + functionally)
- Minor naming inconsistencies flagged (`recommendations` vs `recommended_actions`) — non-blocking
- Cosmetic favicon 404 — non-blocking

## Pending / Backlog
- **P2**: Deploy real CredentialRegistry smart contract (currently using contract-less calldata anchoring)
- **P2**: Full ATS Recruitment UI (resume parser flow with blind hiring)
- **P2**: On-Demand Pay + Multi-currency / crypto payroll
- **P2**: Next.js frontend migration (currently CRA)
- **P1**: WhatsApp Meta allow-list setup OR production-mode application (Business Verification)
- **P1**: Sepolia faucet funding to enable on-chain credential anchoring

## HR Suggestions (from this session, awaiting user pick)
1. OKR & Goal Tracking with AI drafting
2. Smart Leave Forecasting / conflict detection
3. Anonymous Pulse Surveys (auto-flow into Sentiment Dashboard)
4. L&D Tracker with course completion → blockchain certs
5. Peer Recognition / Kudos Wall
6. Team Time-Off Calendar
7. Expense Reimbursement (OCR + workflow)
8. Birthday / Anniversary Auto-Greetings (WhatsApp + dashboard)
9. Exit Interviews + Offboarding Checklist
10. Mobile PWA with offline punch
