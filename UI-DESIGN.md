# UI Design - SSV Keyshare Registration Console

## Design goals

- Make the full validator registration flow understandable in one screen.
- Keep sensitive actions explicit (unlocking keystore, wallet signing, network selection).
- Show batching logic clearly before users submit transactions.
- Support both mouse and keyboard workflows, including drag-and-drop.

## Primary layout

Single-page desktop-first layout with two cards:

1. **Setup (left card)**
   - Keystore file upload area (click + drag and drop)
   - Keystore password input
   - Network selector (default: Ethereum Mainnet, alternative: Hoodi)
   - Dynamic operator ID input list (starts with 4 fields)
   - `+` control to add operators (up to 13) and remove controls per row
   - Warning label when count is not one of `4`, `7`, `10`, `13`
   - Wallet connect/disconnect status

2. **Execution Plan (right card)**
   - Cluster summary (operator count, per-transaction key limit)
   - Auto-detected validator key count from uploaded keystores
   - Deposit amount input for `registerValidators` calls
   - Computed queue list with batches
   - Action buttons for keyshare generation and registration queueing
   - Progress checklist for overall readiness

## Wireframe (v1)

```text
+--------------------------------------------------------------------------+
| SSV Validator Operations                                                  |
| Keyshare Registration Console                                             |
| Draft and queue validator registration from EIP-2335 keystores           |
+--------------------------------------------------------------------------+
| Setup                                   | Execution Plan                  |
|-----------------------------------------|---------------------------------|
| [ Drop EIP-2335 files here ]            | [Cluster size] [Batch limit]    |
| file-a.json                             | [Planned batches]               |
| file-b.json                             |                                 |
|                                         | Validator keys: 165              |
| Keystore password: [ *************** ]  |                                 |
| Deposit / tx: [ 0.0 ]                   |                                 |
| Network: [ Ethereum Mainnet v ]         | Queue                           |
| Operators: [5] [6] [7] [8] [+Add]       | Batch 1  Keys 1-80    ready     |
|                                         | Batch 2  Keys 81-160  queued    |
| Wallet: [Connect via WC] [Not connected] | Batch 3  Keys 161-165 queued    |
|                                         |                                 |
|                                         | [Generate keyshares]            |
|                                         | [Queue registration txs]        |
|                                         |                                 |
|                                         | [Upload] [Unlock] [Connect] ... |
+--------------------------------------------------------------------------+
```

## Interaction model

### Keystore upload
- Accept `.json` files through click-select and drag-and-drop.
- Show selected file names immediately.
- Empty state text: "No keystore files selected yet."

### Wallet connection
- Uses WalletConnect provider + `viem` custom transport.
- Supports connect/disconnect session states, chain change events, and account changes.

### Network selector
- Dropdown values:
  - `Ethereum Mainnet` (default)
  - `Hoodi`

### Batch preview
- Uses rules keyed by operator count:
  - 4 operators -> 80 keys / tx
  - 7 operators -> 40 keys / tx
  - 10 operators -> 30 keys / tx
  - 13 operators -> 20 keys / tx
- When operator count is not one of these values, batch planning is blocked and warning is shown.
- Queue UI emphasizes sequential submission (batch N+1 waits for batch N receipt).

### Operator preflight
- Fetch selected operators using `sdk.api.getOperators({ operatorIds })`.
- Use fetched operator public keys as source for keyshare generation.
- For private operators, verify connected wallet is whitelisted by every selected private operator.

## Visual direction

- Tone: operational console, clean and deliberate.
- Typography:
  - Primary: `Sora`
  - Monospace data labels: `IBM Plex Mono`
- Color strategy:
  - Teal for main action and trust cues
  - Amber for queue/attention indicators
  - Soft light gradient background for depth
- Motion:
  - subtle card entrance animation
  - drag-over highlight on dropzone

## Responsive behavior

- Desktop: 2-column grid (setup + plan).
- Tablet/mobile: collapses to single column while preserving section order.
- Buttons become full width on narrow screens.

## Notes for next iteration

- Add inline validation states for malformed keystore JSON and wrong password.
- Add transaction timeline with hashes and confirmation states.
- Add advanced mode for custom operator sets and dynamic batch limits.
