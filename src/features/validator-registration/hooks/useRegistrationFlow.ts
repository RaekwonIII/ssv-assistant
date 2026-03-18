import { useEffect, useState } from "react";
import { getTxExplorerUrl, NetworkOption } from "../model/networks";
import { OperatorSelectionValidation } from "../model/operators";
import {
  Address,
  ActivityLevel,
  Batch,
  EIP1193Provider,
  GeneratedKeyshare,
  Hash,
  KeystoreEntry,
  OperatorDetails,
  OperatorSnapshot,
  RuntimeSdk,
  RuntimeChain,
  ValidationSummary,
  WalletActionPrompt,
} from "../model/types";
import { buildSdkContext, getPrivateOperatorAccessReport } from "../services/ssv";
import { loadViemRuntime } from "../services/runtime";
import { verifyProviderSession } from "../services/wallet";
import { createBatchPlan, chunkArray } from "../utils/batching";
import { formatRegistrationQueueError, readErrorMessage } from "../utils/errors";
import { shortenAddress } from "../utils/format";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const KEYSHARE_GENERATION_CHUNK_SIZE = 2;
const TX_CONFIRMATION_TIMEOUT_MS = 60_000;
const TX_PENDING_RECHECK_MS = 12_000;

function parseDepositAmount(
  input: string,
  parseEther: (value: string) => bigint,
): bigint {
  const trimmed = input.trim();

  if (trimmed.length === 0) {
    return 0n;
  }

  return parseEther(trimmed);
}

type UseRegistrationFlowArgs = {
  selectedNetwork: NetworkOption;
  walletAddress: Address | null;
  walletProvider: EIP1193Provider | null;
  setWalletChainId: (chainId: number) => void;
  operatorValidation: OperatorSelectionValidation;
  selectedOperatorIds: number[];
  keystoreEntries: KeystoreEntry[];
  keystorePassword: string;
  maxKeysPerTx: number;
  depositAmountEth: string;
  appendActivity: (level: ActivityLevel, message: string) => void;
  setWalletActionPrompt?: (prompt: WalletActionPrompt | null) => void;
};

export function useRegistrationFlow(args: UseRegistrationFlowArgs) {
  const [operatorSnapshot, setOperatorSnapshot] = useState<
    OperatorSnapshot[] | null
  >(null);
  const [privateOperatorIds, setPrivateOperatorIds] = useState<string[]>([]);
  const [blockedPrivateOperatorIds, setBlockedPrivateOperatorIds] = useState<
    string[]
  >([]);
  const [missingOperatorIds, setMissingOperatorIds] = useState<number[]>([]);
  const [operatorAccessError, setOperatorAccessError] = useState<string | null>(
    null,
  );

  const [generatedKeyshares, setGeneratedKeyshares] = useState<
    GeneratedKeyshare[]
  >([]);
  const [validationSummary, setValidationSummary] =
    useState<ValidationSummary | null>(null);
  const [queueBatches, setQueueBatches] = useState<Batch[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [keystorePasswordError, setKeystorePasswordError] = useState<
    string | null
  >(null);
  const [registrationPhase, setRegistrationPhase] = useState<
    "idle" | "running" | "completed" | "failed"
  >("idle");

  const clearExecutionState = () => {
    setGeneratedKeyshares([]);
    setValidationSummary(null);
    setQueueBatches([]);
    setKeystorePasswordError(null);
    setRegistrationPhase("idle");
  };

  const clearOperatorState = () => {
    setOperatorSnapshot(null);
    setPrivateOperatorIds([]);
    setBlockedPrivateOperatorIds([]);
    setMissingOperatorIds([]);
    setOperatorAccessError(null);
  };

  useEffect(() => {
    clearExecutionState();
    clearOperatorState();
  }, [
    args.selectedNetwork.value,
    args.walletAddress,
    args.walletProvider,
    args.operatorValidation.warning,
    args.selectedOperatorIds.join(","),
    args.keystoreEntries,
    args.keystorePassword,
  ]);

  const createSdkContext = async () => {
    if (!args.walletAddress) {
      throw new Error("Connect your wallet first.");
    }

    if (!args.walletProvider) {
      throw new Error("Wallet provider is not initialized.");
    }

    await verifyProviderSession({
      provider: args.walletProvider,
      expectedAddress: args.walletAddress,
    });

    const context = await buildSdkContext({
      walletAddress: args.walletAddress,
      provider: args.walletProvider,
      network: args.selectedNetwork,
      subgraphApiKey: import.meta.env.VITE_SSV_SUBGRAPH_API_KEY,
      subgraphEndpoint: import.meta.env.VITE_SSV_SUBGRAPH_ENDPOINT,
      setterContract: import.meta.env.VITE_SSV_NETWORK_CONTRACT,
    });

    args.setWalletChainId(context.chain.id);

    return context;
  };

  const runOperatorPreflight = async (
    sdk: RuntimeSdk,
  ): Promise<OperatorDetails[]> => {
    if (!args.walletAddress) {
      throw new Error("Connect your wallet first.");
    }

    if (!args.operatorValidation.isValid) {
      throw new Error(
        args.operatorValidation.warning ??
          "Operator set is invalid. Choose 4, 7, 10, or 13 valid IDs.",
      );
    }

    args.appendActivity(
      "info",
      `Fetching operator data via sdk.api.getOperators for IDs ${args.selectedOperatorIds.join(
        ", ",
      )}.`,
    );

    const operators = await sdk.api.getOperators({
      operatorIds: args.selectedOperatorIds.map((id) => id.toString()),
    });

    const operatorsById = new Map<number, OperatorDetails>(
      operators.map((operator) => [Number(operator.id), operator]),
    );

    const missingOperatorIds = args.selectedOperatorIds.filter(
      (id) => !operatorsById.has(id),
    );

    if (missingOperatorIds.length > 0) {
      const message = `Failed to fetch data for operator IDs: ${missingOperatorIds.join(", ")}.`;
      setMissingOperatorIds(missingOperatorIds);
      setOperatorAccessError(message);
      throw new Error(message);
    }

    const orderedOperators = args.selectedOperatorIds.map(
      (id) => operatorsById.get(id)!,
    );

    const emptyPublicKeyIds = orderedOperators
      .filter((operator) => !operator.publicKey || operator.publicKey.length === 0)
      .map((operator) => operator.id);

    if (emptyPublicKeyIds.length > 0) {
      throw new Error(
        `One or more operators has no public key: ${emptyPublicKeyIds.join(", ")}.`,
      );
    }

    const accessReport = getPrivateOperatorAccessReport({
      operators: orderedOperators,
      walletAddress: args.walletAddress,
    });

    setPrivateOperatorIds(accessReport.privateOperatorIds);
    setBlockedPrivateOperatorIds(accessReport.blockedOperatorIds);
    setOperatorSnapshot(
      orderedOperators.map((operator) => ({
        id: operator.id,
        publicKey: operator.publicKey,
        validatorCount: operator.validatorCount,
        isPrivate: operator.isPrivate,
      })),
    );

    if (accessReport.blockedOperatorIds.length > 0) {
      const message = `Connected wallet is not whitelisted by private operators: ${accessReport.blockedOperatorIds.join(
        ", ",
      )}.`;
      setOperatorAccessError(message);
      throw new Error(message);
    }

    setOperatorAccessError(null);
    setMissingOperatorIds([]);

    if (accessReport.privateOperatorIds.length > 0) {
      args.appendActivity(
        "success",
        `Private operator whitelist check passed for IDs ${accessReport.privateOperatorIds.join(
          ", ",
        )}.`,
      );
    }

    return orderedOperators;
  };

  const canGenerateKeyshares =
    args.keystoreEntries.length > 0 &&
    args.keystorePassword.trim().length > 0 &&
    args.walletAddress !== null &&
    args.walletProvider !== null &&
    args.operatorValidation.isValid &&
    args.maxKeysPerTx > 0 &&
    blockedPrivateOperatorIds.length === 0 &&
    !isGenerating &&
    !isRegistering;

  const canQueueTransactions =
    generatedKeyshares.length > 0 &&
    args.walletAddress !== null &&
    args.walletProvider !== null &&
    args.operatorValidation.isValid &&
    args.maxKeysPerTx > 0 &&
    !queueBatches.some(
      (batch) => batch.status === "submitting" || batch.status === "pending",
    ) &&
    !isGenerating &&
    !isRegistering;

  const generateDisabledReason = (() => {
    if (args.keystoreEntries.length === 0) return "Upload keystore files first.";
    if (args.keystorePassword.trim().length === 0) return "Enter the keystore password.";
    if (args.walletAddress === null || args.walletProvider === null) {
      return "Connect your wallet first.";
    }
    if (!args.operatorValidation.isValid) {
      return (
        args.operatorValidation.warning ??
        "Choose a valid operator set (4, 7, 10, or 13 IDs)."
      );
    }
    if (args.maxKeysPerTx <= 0) return "Operator count does not map to a batch rule.";
    if (blockedPrivateOperatorIds.length > 0) {
      return "Resolve private-operator whitelist restrictions before generating.";
    }
    if (isGenerating) return "Keyshare generation is in progress.";
    if (isRegistering) return "Wait for registration queue to finish.";
    return null;
  })();

  const queueDisabledReason = (() => {
    if (generatedKeyshares.length === 0) return "Generate keyshares first.";
    if (args.walletAddress === null || args.walletProvider === null) {
      return "Connect your wallet first.";
    }
    if (!args.operatorValidation.isValid) {
      return (
        args.operatorValidation.warning ??
        "Choose a valid operator set (4, 7, 10, or 13 IDs)."
      );
    }
    if (args.maxKeysPerTx <= 0) return "Operator count does not map to a batch rule.";
    if (queueBatches.some((batch) => batch.status === "pending")) {
      return "A transaction is pending confirmation. Use 'Check now' in the modal.";
    }
    if (queueBatches.some((batch) => batch.status === "submitting")) {
      return "A transaction is currently being submitted.";
    }
    if (isGenerating) return "Wait for keyshare generation to finish.";
    if (isRegistering) return "Registration queue is already running.";
    return null;
  })();

  const handleGenerateKeyshares = async () => {
    if (!canGenerateKeyshares) {
      return;
    }

    clearExecutionState();
    clearOperatorState();
    setIsGenerating(true);

    try {
      const { sdk } = await createSdkContext();
      const operators = await runOperatorPreflight(sdk);

      args.appendActivity("info", "Reading owner nonce from SSV subgraph.");
      const ownerNonce = Number(
        await sdk.api.getOwnerNonce({ owner: args.walletAddress! }),
      );

      args.appendActivity(
        "info",
        `Generating keyshares for ${args.keystoreEntries.length} validator keys with ${args.selectedOperatorIds.length} operators.`,
      );

      const generated: GeneratedKeyshare[] = [];
      const keystores = args.keystoreEntries.map((entry) => entry.serialized);

      for (
        let offset = 0;
        offset < keystores.length;
        offset += KEYSHARE_GENERATION_CHUNK_SIZE
      ) {
        const keystoreChunk = keystores.slice(
          offset,
          offset + KEYSHARE_GENERATION_CHUNK_SIZE,
        );
        const generatedChunk = await sdk.utils.generateKeyShares({
          keystore: keystoreChunk,
          keystorePassword: args.keystorePassword,
          operatorKeys: operators.map((operator) => operator.publicKey),
          operatorIds: args.selectedOperatorIds,
          ownerAddress: args.walletAddress!,
          nonce: ownerNonce + offset,
        });

        generated.push(...generatedChunk);
        const completed = Math.min(offset + keystoreChunk.length, keystores.length);

        if (completed < keystores.length) {
          await wait(0);
        }
      }

      const validation = await sdk.utils.validateSharesPreRegistration({
        keyshares: generated,
        operatorIds: args.selectedOperatorIds.map((id) => id.toString()),
      });

      const summary: ValidationSummary = {
        available: validation.available.length,
        registered: validation.registered.length,
        incorrect: validation.incorrect.length,
      };

      setValidationSummary(summary);

      if (summary.incorrect > 0) {
        throw new Error(
          `${summary.incorrect} keyshare entries are invalid for registration.`,
        );
      }

      if (summary.registered > 0) {
        throw new Error(
          `${summary.registered} validators are already registered for this operator set.`,
        );
      }

      setGeneratedKeyshares(generated);
      const plannedBatches = createBatchPlan(generated.length, args.maxKeysPerTx);
      setQueueBatches(plannedBatches);
      const totalBatches = plannedBatches.length;
      args.appendActivity(
        "success",
        `Generated and validated ${generated.length} keyshares. Ready to submit ${totalBatches} transaction batch${
          totalBatches === 1 ? "" : "es"
        }.`,
      );
    } catch (error) {
      const message = readErrorMessage(error);
      const normalizedMessage = message.toLowerCase();
      const isInvalidPasswordError =
        normalizedMessage.includes("invalid password") ||
        normalizedMessage.includes("mac mismatch") ||
        normalizedMessage.includes("bad decrypt");
      clearExecutionState();
      if (isInvalidPasswordError) {
        setKeystorePasswordError("Invalid keystore password.");
      }
      args.appendActivity("error", `Keyshare generation failed: ${message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const updateBatchStatus = (batchId: number, patch: Partial<Batch>) => {
    setQueueBatches((current) =>
      current.map((batch) =>
        batch.id === batchId
          ? {
              ...batch,
              ...patch,
            }
          : batch,
      ),
    );
  };

  const isTransactionConfirmationTimeout = (error: unknown): boolean => {
    const message = readErrorMessage(error).toLowerCase();
    return (
      message.includes("timed out while waiting for transaction with hash") &&
      message.includes("to be confirmed")
    );
  };

  const isTransactionReceiptNotFound = (error: unknown): boolean => {
    const message = readErrorMessage(error).toLowerCase();
    return (
      message.includes("receipt for transaction") &&
      message.includes("could not be found")
    );
  };

  const isRetryableRpcError = (error: unknown): boolean => {
    const message = readErrorMessage(error).toLowerCase();
    return (
      message.includes("rpc request failed") ||
      message.includes("network request failed") ||
      message.includes("failed to fetch") ||
      message.includes("fetch failed") ||
      message.includes("socket hang up") ||
      message.includes("timeout")
    );
  };

  const waitForTransactionConfirmation = async (input: {
    publicClient: {
      waitForTransactionReceipt: (input: {
        hash: Hash;
        timeout?: number;
      }) => Promise<{ status: string }>;
      getTransactionReceipt: (input: {
        hash: Hash;
      }) => Promise<{ status: string }>;
    };
    chain: RuntimeChain;
    txHash: Hash;
    batchId: number;
    totalBatches: number;
  }) => {
    try {
      return await input.publicClient.waitForTransactionReceipt({
        hash: input.txHash,
        timeout: TX_CONFIRMATION_TIMEOUT_MS,
      });
    } catch (error) {
      if (!isTransactionConfirmationTimeout(error) && !isRetryableRpcError(error)) {
        throw error;
      }
    }

    updateBatchStatus(input.batchId, { status: "pending" });
    args.appendActivity(
      "info",
      `Batch ${input.batchId}/${input.totalBatches} is still pending. Keeping the queue open and rechecking automatically.`,
    );

    const txUrl = getTxExplorerUrl(args.selectedNetwork, input.txHash);
    let triggerManualCheck: (() => void) | null = null;

    const onManualCheck = () => {
      triggerManualCheck?.();
    };

    while (true) {
      try {
        return await input.publicClient.getTransactionReceipt({
          hash: input.txHash,
        });
      } catch (error) {
        if (!isTransactionReceiptNotFound(error) && !isRetryableRpcError(error)) {
          throw error;
        }
      }

      args.setWalletActionPrompt?.({
        title: "Transaction pending",
        message: `Batch ${input.batchId}/${input.totalBatches} is still pending on ${input.chain.name}.`,
        detail: "This is taking longer than usual due to network congestion.",
        state: "pending",
        txHash: input.txHash,
        txUrl,
        actionLabel: "Check now",
        onAction: onManualCheck,
      });

      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          triggerManualCheck = null;
          resolve();
        }, TX_PENDING_RECHECK_MS);

        triggerManualCheck = () => {
          clearTimeout(timer);
          triggerManualCheck = null;
          resolve();
        };
      });
    }
  };

  const handleQueueRegistration = async () => {
    if (!canQueueTransactions) {
      return;
    }

    setRegistrationPhase("running");
    setIsRegistering(true);

    try {
      const viemRuntime = await loadViemRuntime();
      const { sdk, chain } = await createSdkContext();
      const publicClient = viemRuntime.createPublicClient({
        chain,
        transport: viemRuntime.http(chain.rpcUrls.default.http[0]),
      }) as {
        waitForTransactionReceipt: (input: {
          hash: Hash;
          timeout?: number;
        }) => Promise<{ status: string }>;
        getTransactionReceipt: (input: {
          hash: Hash;
        }) => Promise<{ status: string }>;
      };
      const depositAmount = parseDepositAmount(
        args.depositAmountEth,
        viemRuntime.parseEther,
      );

      const shareChunks = chunkArray(generatedKeyshares, args.maxKeysPerTx);
      const initialBatches = createBatchPlan(
        generatedKeyshares.length,
        args.maxKeysPerTx,
      );

      setQueueBatches(initialBatches);
      args.appendActivity(
        "info",
        `Submitting ${shareChunks.length} registration transactions sequentially.`,
      );

      for (let index = 0; index < shareChunks.length; index += 1) {
        const batchId = index + 1;
        updateBatchStatus(batchId, { status: "submitting", error: undefined });
        args.setWalletActionPrompt?.({
          title: "Confirm transaction on device",
          message: `Approve batch ${batchId}/${shareChunks.length} in your wallet app on your phone.`,
        });

        const transaction = await sdk.clusters.registerValidators({
          args: {
            keyshares: shareChunks[index],
            depositAmount,
          },
        });

        updateBatchStatus(batchId, { txHash: transaction.hash });
        args.appendActivity(
          "info",
          `Batch ${batchId}/${shareChunks.length} submitted: ${shortenAddress(
            transaction.hash,
          )}`,
        );
        args.setWalletActionPrompt?.({
          title: "Transaction submitted",
          message: `Batch ${batchId}/${shareChunks.length} submitted. Waiting for on-chain confirmation.`,
          state: "pending",
          txHash: transaction.hash,
          txUrl: getTxExplorerUrl(args.selectedNetwork, transaction.hash),
        });

        const receipt = await waitForTransactionConfirmation({
          publicClient,
          chain,
          txHash: transaction.hash,
          batchId,
          totalBatches: shareChunks.length,
        });

        if (receipt.status !== "success") {
          throw new Error(`Batch ${batchId} reverted on-chain.`);
        }

        updateBatchStatus(batchId, { status: "confirmed" });
        args.appendActivity(
          "success",
          `Batch ${batchId}/${shareChunks.length} confirmed on ${chain.name}.`,
        );
        args.appendActivity(
          "info",
          `Queue progress: ${batchId}/${shareChunks.length} batch${
            shareChunks.length === 1 ? "" : "es"
          } confirmed.`,
        );
      }

      setRegistrationPhase("completed");
      args.appendActivity(
        "success",
        `Queue completed: ${shareChunks.length}/${shareChunks.length} batches confirmed.`,
      );
      args.setWalletActionPrompt?.({
        title: "Registration completed",
        message: `${shareChunks.length}/${shareChunks.length} batches confirmed on-chain.`,
        state: "success",
      });
      await wait(900);
    } catch (error) {
      const message = formatRegistrationQueueError(error);
      setRegistrationPhase("failed");

      setQueueBatches((current) => {
        const inFlight = current.find((batch) => batch.status === "submitting");

        if (!inFlight) {
          return current;
        }

        return current.map((batch) =>
          batch.id === inFlight.id
            ? {
                ...batch,
                status: "failed",
                error: message,
              }
            : batch,
        );
      });

      args.appendActivity("error", `Registration queue stopped: ${message}`);
    } finally {
      args.setWalletActionPrompt?.(null);
      setIsRegistering(false);
    }
  };

  return {
    operatorSnapshot,
    privateOperatorIds,
    blockedPrivateOperatorIds,
    missingOperatorIds,
    operatorAccessError,
    generatedKeyshares,
    validationSummary,
    queueBatches,
    isGenerating,
    isRegistering,
    keystorePasswordError,
    registrationPhase,
    canGenerateKeyshares,
    canQueueTransactions,
    generateDisabledReason,
    queueDisabledReason,
    handleGenerateKeyshares,
    handleQueueRegistration,
  };
}
