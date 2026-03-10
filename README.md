# SSV Assistant (Tauri + React)

Desktop GUI to parse EIP-2335 keystores, generate SSV keyshares, and submit
batched validator registration transactions on Ethereum Mainnet or Hoodi.

## Current MVP features

- Drag-and-drop + file picker support for EIP-2335 keystore JSON files.
- Keystore password entry and local keystore parsing.
- Wallet connection through WalletConnect (remote wallet pairing).
- Network selector with `Ethereum Mainnet` and `Hoodi`.
- User-defined operator IDs with supported cluster sizes: `4`, `7`, `10`, or `13`.
- Operator metadata retrieval through `sdk.api.getOperators({ operatorIds })`.
- Private operator whitelist check against the connected wallet.
- Keyshare generation + pre-registration validation using `@ssv-labs/ssv-sdk`.
- Sequential queued registration transactions with automatic batching.

Batch size limits currently implemented:

- 4 operators -> 80 keys / tx
- 7 operators -> 40 keys / tx
- 10 operators -> 30 keys / tx
- 13 operators -> 20 keys / tx

## Development

Install dependencies:

```bash
npm install
```

Run frontend dev server:

```bash
npm run dev
```

Run Tauri desktop app:

```bash
npm run tauri dev
```

Build production assets:

```bash
npm run build
```

## Environment variables

Required:

- `VITE_WALLETCONNECT_PROJECT_ID`

You can start from `.env.example` and create a local `.env` file.

Optional (SSV subgraph tuning):

The SSV SDK works without custom subgraph config, but for better rate limits
you can set:

- `VITE_SSV_SUBGRAPH_API_KEY`
- `VITE_SSV_SUBGRAPH_ENDPOINT`

Notes:

- This desktop app runs inside a Tauri WebView, so browser-extension injection
  (`window.ethereum`) is not assumed.
- WalletConnect is the default and supported wallet transport.

## Project structure

- `src/features/validator-registration/components/` UI panels.
- `src/features/validator-registration/hooks/` workflow orchestration hooks.
- `src/features/validator-registration/services/` wallet + SDK integrations.
- `src/features/validator-registration/model/` domain constants/types.
- `src/features/validator-registration/utils/` parsing, batching, formatting helpers.
