# PRD - SSV Desktop Validator Registration Tool (MVP)

## 1) Product summary

Build a Tauri desktop application (React UI) that helps users register Ethereum validators on SSV Network from local EIP-2335 keystore data.

For MVP, the app must:

- accept keystore file upload (click + drag-and-drop),
- collect keystore password,
- connect an EVM wallet,
- let users select target network (`Ethereum Mainnet` default, `Hoodi` optional),
- generate keyshares through `ssv-sdk`,
- register validators on SSV through batched transactions,
- allow users to provide operator IDs with supported set sizes of `4`, `7`, `10`, or `13`.

## 2) Problem and opportunity

Validator registration with SSV involves several technical steps (keystore handling, operator data lookup, keyshare generation, wallet transactions, batching constraints). This is error-prone in manual CLI-first workflows.

The desktop tool should reduce setup friction and prevent invalid submissions by guiding users through a clear, deterministic flow.

## 3) Goals and non-goals

### Goals (MVP)

1. Offer an end-to-end guided flow from keystore upload to validator registration.
2. Enforce transaction batch limits based on operator cluster size.
3. Queue registration batches sequentially and surface progress/errors clearly.
4. Keep all sensitive material local to the desktop app session.

### Non-goals (MVP)

- Operator strategy optimization (the user provides explicit operator IDs).
- Multi-account/session management.
- Fee optimization or automated gas strategy.
- Full validator lifecycle management after registration.

## 4) Target users

- Solo stakers or small validator teams using SSV.
- Technical users who can provide keystore data and sign EVM transactions.

## 5) User stories

1. As a user, I can drag-and-drop my keystore file(s) so I do not need CLI commands.
2. As a user, I can enter my keystore password to unlock the validator data for keyshare generation.
3. As a user, I can connect my wallet and choose Mainnet or Hoodi before submitting transactions.
4. As a user, I can preview batch splitting so I know how many transactions I will sign.
5. As a user, I can submit batched registrations and see each transaction status in order.

## 6) Functional requirements

### FR-01 Keystore ingestion

- Support file selection and drag-and-drop.
- Accept JSON input compliant with EIP-2335 keystore format.
- Validate file structure before proceeding.
- Show parsing errors per file when applicable.

### FR-02 Keystore password capture

- Provide secure password input field.
- Do not persist password to disk.
- Mask input by default.

### FR-03 Wallet connection

- Integrate EVM wallet connection through common web3 connectors (viem-compatible stack).
- Show connected address and connection status.
- Block transaction actions when disconnected.

### FR-04 Network selection

- Dropdown selector with:
  - Ethereum Mainnet (default)
  - Hoodi
- Network selection must affect provider, chain config, and SSV contract context.

### FR-05 Operator set

- Allow user-selected operator IDs with valid set sizes only: `4`, `7`, `10`, `13`.
- Fetch operator metadata using `sdk.api.getOperators({ operatorIds })`.
- Use returned operator public keys for keyshare generation.
- If any selected operator is private, require connected wallet to be whitelisted by all selected private operators.

### FR-06 Keyshare generation

- Generate keyshares via `ssv-sdk` based on:
  - parsed keystore key material,
  - provided password,
  - selected operator details.
- Validate generated keyshares before registration.

### FR-07 Batch planning and limits

Batch size limit is determined by cluster size:

| Operator count | Max validator keys per tx |
| --- | --- |
| 4 | 80 |
| 7 | 40 |
| 10 | 30 |
| 13 | 20 |

- If total validator keys exceed limit, split into multiple batches.
- Create deterministic chunks preserving key order.

### FR-08 Sequential transaction queue

- Submit registration transactions in sequence.
- Wait for tx receipt/success confirmation for batch N before sending batch N+1.
- If batch fails, stop queue and surface error with retry option from failed batch.

### FR-09 UX status and feedback

- Show readiness checklist (upload, password, wallet, batch plan).
- Show per-batch status (`ready`, `queued`, `submitted`, `confirmed`, `failed`).
- Provide transaction hash links where possible.

## 7) Non-functional requirements

### Security

- Never log raw passwords or decrypted private material.
- Keep sensitive values in memory only for active flow.
- Clear in-memory sensitive state after completion/cancel.

### Reliability

- Handle malformed JSON and unsupported formats safely.
- Handle RPC/network failures with actionable user messages.
- Ensure queue state can recover from temporary provider errors.

### Performance

- UI remains responsive while parsing files and preparing batches.
- Batch planning should complete near-instantly for expected validator counts.

### Usability

- Keyboard-accessible form controls.
- Clear default values and error messaging.
- Readable status indicators for long-running registration operations.

## 8) High-level architecture (MVP)

- **Frontend (React in Tauri WebView):**
  - Form, validation, queue UI, state management.
- **Web3/SDK integration layer (TypeScript):**
  - Wallet/client setup, `ssv-sdk` calls, operator lookups, keyshare generation, registration.
- **Tauri shell:**
  - Desktop packaging and local execution context.

No backend service is required for MVP.

## 9) Primary flow

1. User uploads keystore file(s).
2. App validates and parses validator key entries.
3. User enters keystore password.
4. User connects wallet.
5. User selects target network.
6. App fetches operator details for selected operator IDs.
7. App verifies private-operator whitelist access for the connected wallet.
8. App generates and validates keyshares.
9. App computes transaction batches using cluster-size limit.
10. User confirms submission.
11. App submits batches sequentially and updates status.

## 10) Error handling requirements

- Invalid keystore format -> show file-level error; block generation.
- Wrong keystore password -> show unlock/generation error; allow retry.
- Wallet disconnected during queue -> pause/fail with reconnect guidance.
- On-chain revert or RPC error -> mark failed batch and allow retry from that point.

## 11) Success criteria (MVP)

- User can complete one full validator registration workflow from UI only.
- Batch splitting always respects operator-count transaction limits.
- For oversized key sets, queue submits all batches in order without nonce conflicts.
- Failures are visible, localized to the affected batch, and recoverable.

## 12) Milestones

1. **M1 - UX foundation (current):** static UI, design system, flow scaffolding.
2. **M2 - Data wiring:** keystore parsing, password handling, network state, wallet integration.
3. **M3 - SSV pipeline:** operator fetch, keyshare generation/validation, registration transaction building.
4. **M4 - Queue engine:** sequential submission, confirmation tracking, retry logic.
5. **M5 - Hardening:** error UX polish, edge-case testing, release packaging.

## 13) Open questions for iteration

1. Which wallet connection UX should be default in desktop context (injected wallet vs WalletConnect)?
2. Should the app support importing directories or only explicit file lists?
3. Do we require persistence of non-sensitive draft state (network choice, last files) across restarts?
4. Should we include a dry-run simulation mode before signing real transactions?

## 14) Reference docs

- Tauri v2 start: https://v2.tauri.app/start/
- SSV docs root: https://docs.ssv.network/
- SSV SDK keyshare generation example: https://docs.ssv.network/developers/SSV-SDK/examples/generate-and-validate-keyshares
- SSV SDK registration example: https://docs.ssv.network/developers/SSV-SDK/examples/register-validator
- EIP-2335 keystore format: https://eips.ethereum.org/EIPS/eip-2335
