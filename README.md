# SSV Assistant (Tauri + React)

Desktop GUI to parse EIP-2335 keystores, generate SSV keyshares, and submit
batched validator registration transactions on Ethereum Mainnet or Hoodi.

## Current MVP features

- Drag-and-drop + file picker support for EIP-2335 keystore JSON files.
- Keystore password entry and local keystore parsing.
- Wallet connection through injected EVM providers (MetaMask/Rabby style).
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

## Optional environment variables

The SSV SDK works without custom subgraph config, but for better rate limits
you can set:

- `VITE_SSV_SUBGRAPH_API_KEY`
- `VITE_SSV_SUBGRAPH_ENDPOINT`
