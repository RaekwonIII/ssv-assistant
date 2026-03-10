import {
  ChangeEvent,
  DragEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import "./App.css";
import {
  NETWORK_OPTIONS,
  NetworkValue,
  getNetworkOption,
  getTxExplorerUrl,
} from "./features/validator-registration/model/networks";
import {
  ALLOWED_OPERATOR_COUNTS,
  DEFAULT_OPERATOR_INPUTS,
  MAX_OPERATOR_COUNT,
  getBatchLimitForOperatorCount,
  validateOperatorInputs,
} from "./features/validator-registration/model/operators";
import {
  Address,
  ActivityEvent,
  ActivityLevel,
  Batch,
  FileParseReport,
  GeneratedKeyshare,
  KeystoreEntry,
  OperatorDetails,
  OperatorSnapshot,
  RuntimeSdk,
  ValidationSummary,
} from "./features/validator-registration/model/types";
import {
  buildSdkContext,
  getPrivateOperatorAccessReport,
} from "./features/validator-registration/services/ssv";
import { loadViemRuntime } from "./features/validator-registration/services/runtime";
import {
  ensureProviderChain,
  getInjectedProvider,
} from "./features/validator-registration/services/wallet";
import { createBatchPlan, chunkArray } from "./features/validator-registration/utils/batching";
import { readErrorMessage } from "./features/validator-registration/utils/errors";
import { parseKeystoreFiles } from "./features/validator-registration/utils/keystore";

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

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

function App() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [keystoreEntries, setKeystoreEntries] = useState<KeystoreEntry[]>([]);
  const [fileParseReports, setFileParseReports] = useState<FileParseReport[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [keystorePassword, setKeystorePassword] = useState("");
  const [operatorInputs, setOperatorInputs] = useState<string[]>([
    ...DEFAULT_OPERATOR_INPUTS,
  ]);
  const [network, setNetwork] = useState<NetworkValue>("mainnet");
  const [walletAddress, setWalletAddress] = useState<Address | null>(null);
  const [walletChainId, setWalletChainId] = useState<number | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);

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
  const [depositAmountEth, setDepositAmountEth] = useState("0");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [registrationError, setRegistrationError] = useState<string | null>(null);
  const [activityLog, setActivityLog] = useState<ActivityEvent[]>([]);

  const latestUploadTokenRef = useRef(0);
  const activityIdRef = useRef(0);

  const selectedNetwork = getNetworkOption(network);
  const operatorValidation = useMemo(
    () => validateOperatorInputs(operatorInputs),
    [operatorInputs],
  );
  const selectedOperatorIds = operatorValidation.parsedIds;
  const operatorCount = operatorInputs.length;
  const maxKeysPerTx = getBatchLimitForOperatorCount(operatorCount);
  const validatorCount =
    generatedKeyshares.length > 0 ? generatedKeyshares.length : keystoreEntries.length;
  const plannedBatches = useMemo(
    () => createBatchPlan(validatorCount, maxKeysPerTx),
    [validatorCount, maxKeysPerTx],
  );
  const displayedBatches = queueBatches.length > 0 ? queueBatches : plannedBatches;
  const duplicateOperatorIds = useMemo(
    () => new Set(operatorValidation.duplicateIds),
    [operatorValidation.duplicateIds],
  );

  const appendActivity = (level: ActivityLevel, message: string) => {
    activityIdRef.current += 1;

    setActivityLog((current) => {
      const nextEntry: ActivityEvent = {
        id: activityIdRef.current,
        level,
        message,
      };

      return [nextEntry, ...current].slice(0, 12);
    });
  };

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

  const setupSteps = [
    { label: "Upload keystore", complete: keystoreEntries.length > 0 },
    { label: "Unlock keystore", complete: keystorePassword.trim().length > 0 },
    { label: "Connect wallet", complete: walletAddress !== null },
    {
      label: "Validate operators",
      complete:
        operatorValidation.isValid &&
        operatorSnapshot !== null &&
        blockedPrivateOperatorIds.length === 0,
    },
    { label: "Generate keyshares", complete: generatedKeyshares.length > 0 },
    {
      label: "Register batches",
      complete:
        queueBatches.length > 0 &&
        queueBatches.every((batch) => batch.status === "confirmed"),
    },
  ];

  const canGenerateKeyshares =
    keystoreEntries.length > 0 &&
    keystorePassword.trim().length > 0 &&
    walletAddress !== null &&
    operatorValidation.isValid &&
    maxKeysPerTx > 0 &&
    blockedPrivateOperatorIds.length === 0 &&
    !isGenerating &&
    !isRegistering;

  const canQueueTransactions =
    generatedKeyshares.length > 0 &&
    walletAddress !== null &&
    operatorValidation.isValid &&
    maxKeysPerTx > 0 &&
    !isGenerating &&
    !isRegistering;

  useEffect(() => {
    clearExecutionState();
    clearOperatorState();
  }, [network, operatorInputs, walletAddress]);

  const parseSelectedFiles = async (files: File[]) => {
    latestUploadTokenRef.current += 1;
    const uploadToken = latestUploadTokenRef.current;

    setSelectedFiles(files);
    clearExecutionState();

    if (files.length === 0) {
      setKeystoreEntries([]);
      setFileParseReports([]);
      return;
    }

    try {
      const { entries, reports } = await parseKeystoreFiles(files);

      if (uploadToken !== latestUploadTokenRef.current) {
        return;
      }

      setKeystoreEntries(entries);
      setFileParseReports(reports);

      if (entries.length > 0) {
        appendActivity(
          "success",
          `Parsed ${entries.length} keystore entr${
            entries.length === 1 ? "y" : "ies"
          } from ${files.length} file${files.length === 1 ? "" : "s"}.`,
        );
      } else {
        appendActivity("error", "No valid keystore entries were detected.");
      }
    } catch (error) {
      const message = readErrorMessage(error);
      appendActivity("error", `Failed to parse selected files: ${message}`);
    }
  };

  const onFileInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    await parseSelectedFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  };

  const onDrop = async (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
    await parseSelectedFiles(Array.from(event.dataTransfer.files ?? []));
  };

  const onDragOver = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const updateOperatorInput = (index: number, value: string) => {
    setOperatorInputs((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? value : item)),
    );
  };

  const addOperatorInput = () => {
    setOperatorInputs((current) => {
      if (current.length >= MAX_OPERATOR_COUNT) {
        return current;
      }

      return [...current, ""];
    });
  };

  const removeOperatorInput = (index: number) => {
    setOperatorInputs((current) => {
      if (current.length <= 1) {
        return current;
      }

      return current.filter((_, itemIndex) => itemIndex !== index);
    });
  };

  const connectWallet = async () => {
    setConnectError(null);

    try {
      const viemRuntime = await loadViemRuntime();
      const provider = getInjectedProvider();

      if (!provider) {
        throw new Error(
          "No injected wallet found. Install MetaMask or Rabby and enable it for this app.",
        );
      }

      await ensureProviderChain(provider, selectedNetwork);

      const accounts = (await provider.request({
        method: "eth_requestAccounts",
      })) as string[];

      if (!Array.isArray(accounts) || accounts.length === 0) {
        throw new Error("Wallet did not return an account.");
      }

      const connected = viemRuntime.getAddress(accounts[0]);
      setWalletAddress(connected);
      setWalletChainId(selectedNetwork.chainId);
      appendActivity(
        "success",
        `Connected ${shortenAddress(connected)} on ${selectedNetwork.label}.`,
      );
    } catch (error) {
      const message = readErrorMessage(error);
      setConnectError(message);
      appendActivity("error", message);
    }
  };

  const disconnectWallet = () => {
    setWalletAddress(null);
    setWalletChainId(null);
    clearExecutionState();
    clearOperatorState();
    appendActivity("info", "Cleared local wallet session.");
  };

  const createSdkContext = async () => {
    if (!walletAddress) {
      throw new Error("Connect your wallet first.");
    }

    const context = await buildSdkContext({
      walletAddress,
      network: selectedNetwork,
      subgraphApiKey: import.meta.env.VITE_SSV_SUBGRAPH_API_KEY,
      subgraphEndpoint: import.meta.env.VITE_SSV_SUBGRAPH_ENDPOINT,
    });

    setWalletChainId(context.chain.id);

    return context;
  };

  const runOperatorPreflight = async (
    sdk: RuntimeSdk,
  ): Promise<OperatorDetails[]> => {
    if (!walletAddress) {
      throw new Error("Connect your wallet first.");
    }

    if (!operatorValidation.isValid) {
      throw new Error(
        operatorValidation.warning ??
          "Operator set is invalid. Choose 4, 7, 10, or 13 valid IDs.",
      );
    }

    appendActivity(
      "info",
      `Fetching operator data via sdk.api.getOperators for IDs ${selectedOperatorIds.join(", ")}.`,
    );

    const operators = await sdk.api.getOperators({
      operatorIds: selectedOperatorIds.map((id) => id.toString()),
    });

    const operatorsById = new Map<number, OperatorDetails>(
      operators.map((operator) => [Number(operator.id), operator]),
    );

    const missingOperatorIds = selectedOperatorIds.filter(
      (id) => !operatorsById.has(id),
    );

    if (missingOperatorIds.length > 0) {
      throw new Error(
        `Failed to fetch data for operator IDs: ${missingOperatorIds.join(", ")}.`,
      );
    }

    const orderedOperators = selectedOperatorIds.map(
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
      walletAddress,
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
      const message = `Connected wallet is not whitelisted by private operators: ${accessReport.blockedOperatorIds.join(", ")}.`;
      setOperatorAccessError(message);
      throw new Error(message);
    }

    setOperatorAccessError(null);

    if (accessReport.privateOperatorIds.length > 0) {
      appendActivity(
        "success",
        `Private operator whitelist check passed for IDs ${accessReport.privateOperatorIds.join(
          ", ",
        )}.`,
      );
    }

    return orderedOperators;
  };

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

      appendActivity("info", "Reading owner nonce from SSV subgraph.");
      const ownerNonce = Number(await sdk.api.getOwnerNonce({ owner: walletAddress! }));

      appendActivity(
        "info",
        `Generating keyshares for ${keystoreEntries.length} validator keys with ${selectedOperatorIds.length} operators.`,
      );

      const generated = await sdk.utils.generateKeyShares({
        keystore: keystoreEntries.map((entry) => entry.serialized),
        keystorePassword,
        operatorKeys: operators.map((operator) => operator.publicKey),
        operatorIds: selectedOperatorIds,
        ownerAddress: walletAddress!,
        nonce: ownerNonce,
      });

      appendActivity("info", "Validating generated keyshares before registration.");
      const validation = await sdk.utils.validateSharesPreRegistration({
        keyshares: generated,
        operatorIds: selectedOperatorIds.map((id) => id.toString()),
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
      setQueueBatches(createBatchPlan(generated.length, maxKeysPerTx));

      const totalBatches = createBatchPlan(generated.length, maxKeysPerTx).length;
      appendActivity(
        "success",
        `Generated and validated ${generated.length} keyshares. Ready to submit ${totalBatches} transaction batch${totalBatches === 1 ? "" : "es"}.`,
      );
    } catch (error) {
      const message = readErrorMessage(error);
      setGenerationError(message);
      clearExecutionState();
      appendActivity("error", `Keyshare generation failed: ${message}`);
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
        depositAmountEth,
        viemRuntime.parseEther,
      );

      const shareChunks = chunkArray(generatedKeyshares, maxKeysPerTx);
      const initialBatches = createBatchPlan(generatedKeyshares.length, maxKeysPerTx);

      setQueueBatches(initialBatches);
      appendActivity(
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
        appendActivity(
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
        appendActivity(
          "success",
          `Batch ${batchId}/${shareChunks.length} confirmed on ${chain.name}.`,
        );
      }

      appendActivity("success", "All registration transactions confirmed.");
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

      appendActivity("error", `Registration queue stopped: ${message}`);
    } finally {
      setIsRegistering(false);
    }
  };

  const toggleWalletConnection = () => {
    if (walletAddress) {
      disconnectWallet();
      return;
    }

    void connectWallet();
  };

  return (
    <div className="app-shell">
      <header className="hero">
        <p className="eyebrow">SSV Validator Operations</p>
        <h1>Keyshare Registration Console</h1>
        <p className="hero-copy">
          Draft and queue validator registration transactions from EIP-2335
          keystores with selectable operator sets.
        </p>
      </header>

      <main className="workspace">
        <section className="card setup-card">
          <h2>Setup</h2>
          <p className="section-copy">
            Provide validator credentials and chain context before generating
            keyshares.
          </p>

          <div className="field-block">
            <span className="field-label">Keystore file upload</span>
            <label
              className={`dropzone ${isDragging ? "is-dragging" : ""}`}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
            >
              <input
                type="file"
                accept=".json,application/json"
                multiple
                onChange={onFileInputChange}
              />
              <strong>Drop EIP-2335 files here</strong>
              <span>or click to browse local files</span>
            </label>
            {selectedFiles.length === 0 ? (
              <p className="hint">No keystore files selected yet.</p>
            ) : (
              <ul className="file-list">
                {fileParseReports.map((report) => (
                  <li
                    key={report.fileName}
                    className={`file-item ${
                      report.errors.length > 0 ? "has-error" : ""
                    }`}
                  >
                    <div className="file-item-head">
                      <span>{report.fileName}</span>
                      <span>
                        {report.entryCount} key{report.entryCount === 1 ? "" : "s"}
                      </span>
                    </div>
                    {report.errors.map((error, errorIndex) => (
                      <p
                        key={`${report.fileName}-error-${errorIndex}`}
                        className="error-text"
                      >
                        {error}
                      </p>
                    ))}
                  </li>
                ))}
              </ul>
            )}
            <p className="hint">
              Parsed validator keys: <strong>{keystoreEntries.length}</strong>
            </p>
          </div>

          <div className="field-block">
            <label className="field-label" htmlFor="keystore-password">
              Keystore password
            </label>
            <input
              id="keystore-password"
              type="password"
              value={keystorePassword}
              onChange={(event) => setKeystorePassword(event.target.value)}
              placeholder="Enter keystore password"
              autoComplete="off"
            />
          </div>

          <div className="field-block">
            <label className="field-label" htmlFor="network-select">
              Target network
            </label>
            <select
              id="network-select"
              value={network}
              onChange={(event) =>
                setNetwork(event.target.value as (typeof NETWORK_OPTIONS)[number]["value"])
              }
            >
              {NETWORK_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field-block">
            <div className="operator-controls">
              <span className="field-label">Operator set IDs</span>
              <button
                type="button"
                className="button secondary operator-add"
                onClick={addOperatorInput}
                disabled={
                  operatorInputs.length >= MAX_OPERATOR_COUNT ||
                  isGenerating ||
                  isRegistering
                }
              >
                + Add operator
              </button>
            </div>
            <p className="hint">
              Allowed sizes: {ALLOWED_OPERATOR_COUNTS.join(", ")} operators.
            </p>

            <div className="operator-input-list">
              {operatorInputs.map((value, index) => {
                const parsedValue = Number(value.trim());
                const hasNumericValue =
                  Number.isInteger(parsedValue) && parsedValue > 0;
                const isInvalidId = operatorValidation.invalidIndexes.includes(index);
                const isDuplicateId =
                  hasNumericValue && duplicateOperatorIds.has(parsedValue);

                return (
                  <div key={`operator-input-${index}`} className="operator-input-row">
                    <input
                      className={`operator-id-input ${
                        isInvalidId || isDuplicateId ? "invalid" : ""
                      }`}
                      value={value}
                      onChange={(event) =>
                        updateOperatorInput(index, event.target.value)
                      }
                      placeholder={`Operator ID #${index + 1}`}
                      inputMode="numeric"
                    />
                    <button
                      type="button"
                      className="button secondary operator-remove"
                      onClick={() => removeOperatorInput(index)}
                      disabled={
                        operatorInputs.length <= 1 || isGenerating || isRegistering
                      }
                    >
                      Remove
                    </button>
                  </div>
                );
              })}
            </div>

            {operatorValidation.warning ? (
              <p className="error-text">
                {operatorValidation.warning} Add or remove operators to continue.
              </p>
            ) : null}

            {operatorAccessError ? (
              <p className="error-text">{operatorAccessError}</p>
            ) : null}

            {privateOperatorIds.length > 0 && blockedPrivateOperatorIds.length === 0 ? (
              <p className="hint">
                Private operators selected ({privateOperatorIds.join(", ")}).
                Connected wallet is whitelisted.
              </p>
            ) : null}
          </div>

          <div className="field-block wallet-block">
            <span className="field-label">Wallet connection</span>
            <div className="wallet-row">
              <button
                type="button"
                className="button secondary"
                onClick={toggleWalletConnection}
                disabled={isGenerating || isRegistering}
              >
                {walletAddress ? "Disconnect wallet" : "Connect wallet"}
              </button>
              <span
                className={`wallet-pill ${
                  walletAddress ? "connected" : "disconnected"
                }`}
              >
                {walletAddress
                  ? `Connected: ${shortenAddress(walletAddress)}`
                  : "Not connected"}
              </span>
            </div>
            {walletChainId !== null && walletAddress ? (
              <p className="hint">
                Wallet chain ID: {walletChainId} ({selectedNetwork.label})
              </p>
            ) : null}
            {connectError ? <p className="error-text">{connectError}</p> : null}
          </div>
        </section>

        <section className="card planner-card">
          <h2>Execution Plan</h2>
          <p className="section-copy">
            Review batch sizing and transaction queue behavior before submitting.
          </p>

          <div className="stats-grid">
            <article className="stat-card">
              <span>Cluster size</span>
              <strong>{operatorCount} operators</strong>
              <small>
                {operatorValidation.isValid
                  ? selectedOperatorIds.join(", ")
                  : operatorInputs.join(", ")}
              </small>
            </article>
            <article className="stat-card">
              <span>Batch limit</span>
              <strong>{maxKeysPerTx > 0 ? `${maxKeysPerTx} keys / tx` : "Unavailable"}</strong>
              <small>
                {maxKeysPerTx > 0
                  ? `Rule for ${operatorCount} operators`
                  : "Choose 4, 7, 10, or 13 operators"}
              </small>
            </article>
            <article className="stat-card">
              <span>Planned batches</span>
              <strong>{displayedBatches.length}</strong>
              <small>{validatorCount} validator keys</small>
            </article>
          </div>

          <div className="field-block">
            <label className="field-label" htmlFor="deposit-amount">
              Deposit amount per transaction (ETH)
            </label>
            <input
              id="deposit-amount"
              type="text"
              value={depositAmountEth}
              onChange={(event) => setDepositAmountEth(event.target.value)}
              placeholder="0.0"
            />
            <p className="hint">
              The SDK passes this value as `depositAmount` in each
              `registerValidators` call.
            </p>
          </div>

          {validationSummary ? (
            <div className="status-banner">
              <span>Validation</span>
              <strong>{validationSummary.available} available</strong>
              <small>
                {validationSummary.registered} registered, {validationSummary.incorrect}{" "}
                incorrect
              </small>
            </div>
          ) : null}

          {operatorSnapshot ? (
            <div className="operator-table">
              <div className="queue-header">
                <span>Fetched operators</span>
                <span>Data from sdk.api.getOperators</span>
              </div>
              <ul>
                {operatorSnapshot.map((operator) => (
                  <li key={operator.id}>
                    <span>#{operator.id}</span>
                    <span>{shortenAddress(operator.publicKey)}</span>
                    <span>{operator.isPrivate ? "private" : "public"}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="batch-queue">
            <div className="queue-header">
              <span>Transaction queue</span>
              <span>Status flow: ready - queued - submitting - confirmed</span>
            </div>
            {displayedBatches.length === 0 ? (
              <p className="hint">
                Upload and parse keystores to preview automatic transaction
                batching.
              </p>
            ) : (
              <ul>
                {displayedBatches.map((batch) => (
                  <li key={batch.id}>
                    <span>Batch {batch.id}</span>
                    <span>
                      Keys {batch.start}-{batch.end} ({batch.size})
                    </span>
                    <span className={`batch-state ${batch.status}`}>
                      {batch.status}
                    </span>
                    {batch.txHash ? (
                      <a
                        href={getTxExplorerUrl(selectedNetwork, batch.txHash) ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="tx-link"
                      >
                        {shortenAddress(batch.txHash)}
                      </a>
                    ) : null}
                    {batch.error ? <p className="error-text">{batch.error}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="actions">
            <button
              type="button"
              className="button primary"
              disabled={!canGenerateKeyshares}
              onClick={() => void handleGenerateKeyshares()}
            >
              {isGenerating ? "Generating keyshares..." : "Generate keyshares"}
            </button>
            <button
              type="button"
              className="button accent"
              disabled={!canQueueTransactions}
              onClick={() => void handleQueueRegistration()}
            >
              {isRegistering
                ? "Submitting registration queue..."
                : "Queue registration transactions"}
            </button>
          </div>

          {generationError ? <p className="error-text">{generationError}</p> : null}
          {registrationError ? (
            <p className="error-text">{registrationError}</p>
          ) : null}

          <div className="activity-feed">
            <div className="queue-header">
              <span>Activity</span>
              <span>Latest first</span>
            </div>
            {activityLog.length === 0 ? (
              <p className="hint">No actions executed yet.</p>
            ) : (
              <ul>
                {activityLog.map((event) => (
                  <li key={event.id} className={`log-item ${event.level}`}>
                    {event.message}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <ul className="step-list">
            {setupSteps.map((step) => (
              <li key={step.label} className={step.complete ? "complete" : "pending"}>
                {step.label}
              </li>
            ))}
          </ul>

          <p className="footnote">
            Queue behavior: wait for each transaction receipt before sending the
            next batch to avoid nonce conflicts and preserve deterministic retry.
          </p>
        </section>
      </main>
    </div>
  );
}

export default App;
