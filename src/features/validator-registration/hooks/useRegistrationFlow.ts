import { useEffect, useState } from "react";
import { NetworkOption } from "../model/networks";
import { OperatorSelectionValidation } from "../model/operators";
import {
  Address,
  ActivityLevel,
  Batch,
  EIP1193Provider,
  GeneratedKeyshare,
  KeystoreEntry,
  OperatorDetails,
  OperatorSnapshot,
  RuntimeSdk,
  ValidationSummary,
} from "../model/types";
import { buildSdkContext, getPrivateOperatorAccessReport } from "../services/ssv";
import { loadViemRuntime } from "../services/runtime";
import { createBatchPlan, chunkArray } from "../utils/batching";
import { readErrorMessage } from "../utils/errors";
import { shortenAddress } from "../utils/format";

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
};

export function useRegistrationFlow(args: UseRegistrationFlowArgs) {
  const [operatorSnapshot, setOperatorSnapshot] = useState<
    OperatorSnapshot[] | null
  >(null);
  const [privateOperatorIds, setPrivateOperatorIds] = useState<string[]>([]);
  const [blockedPrivateOperatorIds, setBlockedPrivateOperatorIds] = useState<
    string[]
  >([]);
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
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [registrationError, setRegistrationError] = useState<string | null>(null);

  const clearExecutionState = () => {
    setGeneratedKeyshares([]);
    setValidationSummary(null);
    setQueueBatches([]);
    setGenerationError(null);
    setRegistrationError(null);
  };

  const clearOperatorState = () => {
    setOperatorSnapshot(null);
    setPrivateOperatorIds([]);
    setBlockedPrivateOperatorIds([]);
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

    const context = await buildSdkContext({
      walletAddress: args.walletAddress,
      provider: args.walletProvider,
      network: args.selectedNetwork,
      subgraphApiKey: import.meta.env.VITE_SSV_SUBGRAPH_API_KEY,
      subgraphEndpoint: import.meta.env.VITE_SSV_SUBGRAPH_ENDPOINT,
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
      throw new Error(
        `Failed to fetch data for operator IDs: ${missingOperatorIds.join(", ")}.`,
      );
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
    !isGenerating &&
    !isRegistering;

  const handleGenerateKeyshares = async () => {
    if (!canGenerateKeyshares) {
      return;
    }

    setGenerationError(null);
    setRegistrationError(null);
    setIsGenerating(true);
    clearExecutionState();
    clearOperatorState();

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

      const generated = await sdk.utils.generateKeyShares({
        keystore: args.keystoreEntries.map((entry) => entry.serialized),
        keystorePassword: args.keystorePassword,
        operatorKeys: operators.map((operator) => operator.publicKey),
        operatorIds: args.selectedOperatorIds,
        ownerAddress: args.walletAddress!,
        nonce: ownerNonce,
      });

      args.appendActivity("info", "Validating generated keyshares before registration.");
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
      setQueueBatches(createBatchPlan(generated.length, args.maxKeysPerTx));

      const totalBatches = createBatchPlan(generated.length, args.maxKeysPerTx).length;
      args.appendActivity(
        "success",
        `Generated and validated ${generated.length} keyshares. Ready to submit ${totalBatches} transaction batch${
          totalBatches === 1 ? "" : "es"
        }.`,
      );
    } catch (error) {
      const message = readErrorMessage(error);
      setGenerationError(message);
      clearExecutionState();
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

  const handleQueueRegistration = async () => {
    if (!canQueueTransactions) {
      return;
    }

    setRegistrationError(null);
    setIsRegistering(true);

    try {
      const viemRuntime = await loadViemRuntime();
      const { sdk, chain } = await createSdkContext();
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

        const receipt = await transaction.wait();

        if (receipt.status !== "success") {
          throw new Error(`Batch ${batchId} reverted on-chain.`);
        }

        updateBatchStatus(batchId, { status: "confirmed" });
        args.appendActivity(
          "success",
          `Batch ${batchId}/${shareChunks.length} confirmed on ${chain.name}.`,
        );
      }

      args.appendActivity("success", "All registration transactions confirmed.");
    } catch (error) {
      const message = readErrorMessage(error);
      setRegistrationError(message);

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
      setIsRegistering(false);
    }
  };

  return {
    operatorSnapshot,
    privateOperatorIds,
    blockedPrivateOperatorIds,
    operatorAccessError,
    generatedKeyshares,
    validationSummary,
    queueBatches,
    isGenerating,
    isRegistering,
    generationError,
    registrationError,
    canGenerateKeyshares,
    canQueueTransactions,
    handleGenerateKeyshares,
    handleQueueRegistration,
  };
}
