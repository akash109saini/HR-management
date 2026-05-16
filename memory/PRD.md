# HRMS 2026 - Multi-Tenant HR Management SaaS

## Architecture (CURRENT STATE)
| Layer | Technology | Port | Status |
|-------|-----------|------|--------|
| Core HR Backend | Python FastAPI | 8001 | ✅ Running |
| AI Engine | FastAPI routes (/api/ai/*) | 8001 | ✅ Running |
| WhatsApp | FastAPI routes (/api/whatsapp/*) | 8001 | ✅ Running (Meta API connected) |
| Blockchain | FastAPI routes (/api/blockchain/*) | 8001 | ✅ Running (Sepolia connected, 0 ETH) |
| NestJS Backend | Node.js NestJS | 8002 | 🚧 Scaffolded, unused by frontend |
| Frontend | React (CRA) | 3000 | ✅ Running |
| Database | MongoDB | 27017 | ✅ Running |

## Live Features
### Authentication
- JWT cookies + Bearer header (interceptor auto-attaches `Authorization`)
- Master Password (`SuperAdmin@123`) — Super Admin can log into any tenant
- Password reset, show/hide password eye buttons

### AI (Emergent LLM Key, GPT-4.1-mini)
- `/api/ai/chat`, `/api/ai/sentiment`, `/api/ai/attrition-risk/:id`,
  `/api/ai/parse-resume`, `/api/ai/career-path/:id`

### WhatsApp (Meta Cloud API) — NEW THIS SESSION
- `GET /api/whatsapp/webhook` — Meta verification handshake (verify_token=`hrms_whatsapp_verify_token_2026`)
- `POST /api/whatsapp/webhook` — Receives messages, identifies employee by mobile,
  routes to bot (`leave balance`, `payslip`, `apply leave`, `my profile`, `help`)
- `POST /api/whatsapp/send` (HR/Admin) — Manual send (graceful failure if recipient not allow-listed)
- `POST /api/whatsapp/broadcast` (HR/Admin) — Tenant-wide notifications
- `GET /api/whatsapp/messages` — Conversation history (scoped by role)
- `GET /api/whatsapp/status` — Configuration & setup guide

Note: Meta only delivers to numbers added to the allow-list in dev mode. Backend stores all attempts with `send_status` field.

### Blockchain Credentials (Ethereum Sepolia) — NEW THIS SESSION
- `GET /api/blockchain/status` — Wallet, balance, faucet links
- `POST /api/blockchain/credentials/issue` (HR/Admin) — SHA-256 + EIP-191 sign
- `POST /api/blockchain/credentials/verify` (public) — Recover signer & compare
- `GET /api/blockchain/credentials/{uid}` — Detail view (for QR / public link)
- `GET /api/blockchain/credentials` — Scoped list (HR=tenant, Employee=self)
- `POST /api/blockchain/credentials/{uid}/anchor` (HR/Admin) — Optional on-chain anchor (needs ≥0.001 ETH)
- `POST /api/blockchain/credentials/{uid}/revoke` (HR/Admin) — Off-chain revocation flag
- Frontend page `/blockchain-credentials` with List / Issue / Verify tabs (all roles)

Default flow is gas-free off-chain signing. On-chain anchoring is optional, gated by wallet balance.

## Key Files
- `/app/backend/server.py` — All routers registered
- `/app/backend/routes/whatsapp_routes.py` (456 lines)
- `/app/backend/routes/blockchain_routes.py` (276 lines)
- `/app/backend/routes/ai_routes.py`
- `/app/backend/routes/auth_routes.py` (Master Password logic)
- `/app/backend/routes/settings_routes.py` (Master Password CRUD)
- `/app/backend/routes/user_routes.py` (Password reset)
- `/app/frontend/src/pages/BlockchainCredentialsPage.js`
- `/app/frontend/src/pages/AIAssistantPage.js`
- `/app/frontend/src/pages/SuperAdmin/SecuritySettings.js`
- `/app/frontend/src/components/Sidebar.js`
- `/app/frontend/src/App.js`
- `/app/frontend/src/lib/api.js` (token interceptor)

## Schemas (MongoDB)
- `users` — {_id, email, password_hash, role, tenant_id, mobile, employee_id, ...}
- `tenants` — {_id, name, subdomain}
- `settings` — {type: 'master_password', value, updated_at}
- `whatsapp_messages` — {message_id, from/to, employee_id, tenant_id, text, direction, send_status, send_error, created_at}
- `whatsapp_webhooks` — raw webhook log
- `credentials` — {credential_uid, employee_id, tenant_id, credential_type, title, payload, hash, signature, issuer_address, onchain_tx_hash, onchain_anchored, revoked, created_at}

## P1 / P2 Roadmap
- **P1**: WhatsApp HR Admin UI (send/broadcast/history view) — backend ready
- **P1**: Sentiment Analysis Dashboard for HR managers
- **P1**: Next.js migration (currently CRA)
- **P2**: AI Predictive Attrition + Intelligent Recruitment (ATS) module
- **P2**: On-Demand Pay + Multi-currency / crypto payroll
- **P2**: Deploy a credential registry smart contract (currently using contract-less calldata anchoring)

## Recent Verification
- 22/23 backend pytest tests passed (iteration_7.json)
- Frontend Blockchain page UI verified end-to-end (issue/verify/revoke flows)
- WhatsApp webhook verify, receive (known + unknown user), send all working
- Off-chain credential signing & verification cryptographically valid; tampering detected
