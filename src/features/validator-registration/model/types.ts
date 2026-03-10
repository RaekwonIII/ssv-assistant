export type Address = `0x${string}`;

export type Hash = `0x${string}`;

export type EIP1193Provider = {
  request: (args: {
    method: string;
    params?: unknown[] | Record<string, unknown>;
  }) => Promise<unknown>;
};

export type RuntimeChain = {
  id: number;
  name: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  rpcUrls: {
    default: {
      http: readonly string[];
    };
  };
  blockExplorers?: {
    default?: {
      url: string;
    };
  };
};

export type ActivityLevel = "info" | "success" | "error";

export type ActivityEvent = {
  id: number;
  level: ActivityLevel;
  message: string;
};

export type KeystoreEntry = {
  id: string;
  fileName: string;
  serialized: string;
  pubkey?: string;
};

export type FileParseReport = {
  fileName: string;
  entryCount: number;
  errors: string[];
};

export type OperatorDetails = {
  id: string;
  publicKey: string;
  validatorCount: string;
  isPrivate: boolean;
  whitelisted: Address[];
};

export type OperatorSnapshot = {
  id: string;
  publicKey: string;
  validatorCount: string;
  isPrivate: boolean;
};

export type GeneratedKeyshare = {
  publicKey: string;
  operatorIds: number[];
  sharesData: string;
};

export type ValidationSummary = {
  available: number;
  registered: number;
  incorrect: number;
};

export type BatchStatus =
  | "ready"
  | "queued"
  | "submitting"
  | "confirmed"
  | "failed";

export type Batch = {
  id: number;
  start: number;
  end: number;
  size: number;
  status: BatchStatus;
  txHash?: Hash;
  error?: string;
};

export type RuntimeSdk = {
  api: {
    getOperators: (args: { operatorIds: string[] }) => Promise<OperatorDetails[]>;
    getOwnerNonce: (args: { owner: Address }) => Promise<number | string | bigint>;
  };
  utils: {
    generateKeyShares: (args: {
      operatorKeys: string[];
      operatorIds: number[];
      keystore: string | string[];
      keystorePassword: string;
      ownerAddress: Address;
      nonce: number;
    }) => Promise<GeneratedKeyshare[]>;
    validateSharesPreRegistration: (args: {
      keyshares: string | object | GeneratedKeyshare[];
      operatorIds: string[];
    }) => Promise<{
      available: unknown[];
      registered: unknown[];
      incorrect: unknown[];
    }>;
  };
  clusters: {
    registerValidators: (args: {
      args: {
        keyshares: GeneratedKeyshare[];
        depositAmount?: bigint;
      };
    }) => Promise<{
      hash: Hash;
      wait: () => Promise<{ status: string }>;
    }>;
  };
};

export type SdkContext = {
  sdk: RuntimeSdk;
  chain: RuntimeChain;
};

export type Eip1193RpcError = {
  code?: number;
  message?: string;
};
