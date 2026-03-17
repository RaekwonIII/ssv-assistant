import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { SetupPanel } from "./features/validator-registration/components/SetupPanel";
import { ExecutionPanel } from "./features/validator-registration/components/ExecutionPanel";
import {
  NetworkValue,
  getNetworkOption,
} from "./features/validator-registration/model/networks";
import { getBatchLimitForOperatorCount } from "./features/validator-registration/model/operators";
import { WalletActionPrompt } from "./features/validator-registration/model/types";
import { useActivityLog } from "./features/validator-registration/hooks/useActivityLog";
import { useKeystoreUpload } from "./features/validator-registration/hooks/useKeystoreUpload";
import { useOperatorInputs } from "./features/validator-registration/hooks/useOperatorInputs";
import { useRegistrationFlow } from "./features/validator-registration/hooks/useRegistrationFlow";
import { useWalletConnection } from "./features/validator-registration/hooks/useWalletConnection";
import { createBatchPlan } from "./features/validator-registration/utils/batching";

function App() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [network, setNetwork] = useState<NetworkValue>("mainnet");
  const [keystorePassword, setKeystorePassword] = useState("");
  const [depositAmountEth, setDepositAmountEth] = useState("0");
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [walletActionPrompt, setWalletActionPrompt] =
    useState<WalletActionPrompt | null>(null);

  useEffect(() => {
    const storedTheme = localStorage.getItem("ssv-assistant-theme");

    if (storedTheme === "light" || storedTheme === "dark") {
      setTheme(storedTheme);
      return;
    }

    const prefersDark =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    setTheme(prefersDark ? "dark" : "light");
  }, []);

  useEffect(() => {
    document.body.dataset.theme = theme;
    localStorage.setItem("ssv-assistant-theme", theme);
  }, [theme]);

  const selectedNetwork = getNetworkOption(network);

  const { activityLog, appendActivity, clearActivityLog } = useActivityLog();

  const {
    operatorInputs,
    operatorValidation,
    selectedOperatorIds,
    duplicateOperatorIds,
    updateOperatorInput,
    setOperatorCount,
    resetOperatorInputs,
  } = useOperatorInputs();

  const {
    selectedFiles,
    keystoreEntries,
    fileParseReports,
    isDragging,
    onFileInputChange,
    onDrop,
    onDragOver,
    onDragLeave,
    resetUploads,
  } = useKeystoreUpload({
    appendActivity,
  });

  const {
    walletAddress,
    walletChainId,
    walletProvider,
    walletSessionVerified,
    connectError,
    setWalletChainId,
    toggleWalletConnection,
  } = useWalletConnection({
    appendActivity,
    setWalletActionPrompt,
  });

  const operatorCount = operatorInputs.length;
  const maxKeysPerTx = getBatchLimitForOperatorCount(operatorCount);

  const {
    operatorSnapshot,
    privateOperatorIds,
    blockedPrivateOperatorIds,
    operatorAccessError,
    generatedKeyshares,
    validationSummary,
    queueBatches,
    isGenerating,
    isRegistering,
    registrationPhase,
    canGenerateKeyshares,
    canQueueTransactions,
    generateDisabledReason,
    queueDisabledReason,
    handleGenerateKeyshares,
    handleQueueRegistration,
  } = useRegistrationFlow({
    selectedNetwork,
    walletAddress,
    walletProvider,
    setWalletChainId,
    operatorValidation,
    selectedOperatorIds,
    keystoreEntries,
    keystorePassword,
    maxKeysPerTx,
    depositAmountEth,
    appendActivity,
    setWalletActionPrompt,
  });

  const validatorCount =
    generatedKeyshares.length > 0 ? generatedKeyshares.length : keystoreEntries.length;
  const plannedBatches = useMemo(
    () => createBatchPlan(validatorCount, maxKeysPerTx),
    [validatorCount, maxKeysPerTx],
  );
  const displayedBatches = queueBatches.length > 0 ? queueBatches : plannedBatches;
  const queuedBatchCount = queueBatches.length;
  const confirmedBatchCount = queueBatches.filter(
    (batch) => batch.status === "confirmed",
  ).length;
  const hasGeneratedKeyshares = generatedKeyshares.length > 0;
  const canStartNewRun =
    registrationPhase === "completed" &&
    queueBatches.length > 0 &&
    queueBatches.every((batch) => batch.status === "confirmed");
  const hasValidDepositValue =
    depositAmountEth.trim().length > 0 &&
    Number.isFinite(Number(depositAmountEth)) &&
    Number(depositAmountEth) >= 0;

  const setupSteps = [
    { label: "Upload keystores", complete: keystoreEntries.length > 0 },
    { label: "Enter keystore password", complete: keystorePassword.trim().length > 0 },
    {
      label: "Validate operators",
      complete:
        operatorValidation.isValid &&
        operatorSnapshot !== null &&
        blockedPrivateOperatorIds.length === 0,
    },
    {
      label: "Connect wallet",
      complete: walletAddress !== null && walletSessionVerified,
    },
    {
      label: "Set deposit amount",
      complete: hasValidDepositValue,
    },
    { label: "Generate keyshares", complete: generatedKeyshares.length > 0 },
    {
      label: "Queue registration transactions",
      complete:
        queueBatches.length > 0 &&
        queueBatches.every((batch) => batch.status === "confirmed"),
    },
  ];

  const handleStartNewRegistration = () => {
    setIsResetConfirmOpen(true);
  };

  const confirmStartNewRegistration = () => {
    setIsResetConfirmOpen(false);
    resetUploads();
    resetOperatorInputs();
    setKeystorePassword("");
    setDepositAmountEth("0");
    clearActivityLog();
    appendActivity("info", "Started a new registration flow.");
  };

  return (
    <div className="app-shell">
      <header className="hero">
        <div className="hero-top">
          <p className="eyebrow">SSV Validator Operations</p>
          <button
            type="button"
            className="theme-toggle"
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
          >
            <span className="theme-toggle-track" aria-hidden="true">
              <span className="theme-icon theme-icon-sun">☀</span>
              <span className="theme-icon theme-icon-moon">🌙</span>
              <span className="theme-toggle-thumb" />
            </span>
          </button>
        </div>
        <h1>Keyshare Registration Console</h1>
        <p className="hero-copy">
          Draft and queue validator registration transactions from EIP-2335
          keystores with selectable operator sets.
        </p>
      </header>

      <main className="workspace">
        <SetupPanel
          selectedFiles={selectedFiles}
          fileParseReports={fileParseReports}
          keystoreEntriesCount={keystoreEntries.length}
          isDragging={isDragging}
          keystorePassword={keystorePassword}
          network={network}
          operatorInputs={operatorInputs}
          operatorValidationWarning={operatorValidation.warning}
          operatorInvalidIndexes={operatorValidation.invalidIndexes}
          duplicateOperatorIds={duplicateOperatorIds}
          operatorAccessError={operatorAccessError}
          privateOperatorIds={privateOperatorIds}
          blockedPrivateOperatorIds={blockedPrivateOperatorIds}
          walletAddress={walletAddress}
          walletSessionVerified={walletSessionVerified}
          walletChainId={walletChainId}
          selectedNetworkLabel={selectedNetwork.label}
          connectError={connectError}
          isGenerating={isGenerating}
          isRegistering={isRegistering}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onFileInputChange={onFileInputChange}
          onKeystorePasswordChange={setKeystorePassword}
          onNetworkChange={setNetwork}
          onOperatorCountChange={setOperatorCount}
          onUpdateOperatorInput={updateOperatorInput}
          onToggleWalletConnection={() => toggleWalletConnection(selectedNetwork)}
        />

        <ExecutionPanel
          operatorCount={operatorCount}
          operatorValidationIsValid={operatorValidation.isValid}
          selectedOperatorIds={selectedOperatorIds}
          operatorInputs={operatorInputs}
          maxKeysPerTx={maxKeysPerTx}
          displayedBatches={displayedBatches}
          validatorCount={validatorCount}
          depositAmountEth={depositAmountEth}
          onDepositAmountChange={setDepositAmountEth}
          validationSummary={validationSummary}
          operatorSnapshot={operatorSnapshot}
          selectedNetwork={selectedNetwork}
          hasGeneratedKeyshares={hasGeneratedKeyshares}
          canGenerateKeyshares={canGenerateKeyshares}
          canQueueTransactions={canQueueTransactions}
          isGenerating={isGenerating}
          isRegistering={isRegistering}
          registrationPhase={registrationPhase}
          queuedBatchCount={queuedBatchCount}
          confirmedBatchCount={confirmedBatchCount}
          canStartNewRun={canStartNewRun}
          onGenerateKeyshares={() => void handleGenerateKeyshares()}
          onQueueTransactions={() => void handleQueueRegistration()}
          onStartNewRun={handleStartNewRegistration}
          generateDisabledReason={generateDisabledReason}
          queueDisabledReason={queueDisabledReason}
          activityLog={activityLog}
          setupSteps={setupSteps}
        />
      </main>
      {isResetConfirmOpen ? (
        <div className="confirm-modal-backdrop" role="presentation">
          <div className="confirm-modal" role="dialog" aria-modal="true">
            <h3>Start new registration?</h3>
            <p>
              This will clear uploaded keystores, operator inputs, password, deposit
              amount, queue status, and activity logs.
            </p>
            <div className="confirm-modal-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setIsResetConfirmOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button accent"
                onClick={confirmStartNewRegistration}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {walletActionPrompt ? (
        <div className="wallet-modal-backdrop" role="presentation">
          <div
            className="wallet-modal"
            role="dialog"
            aria-modal="true"
            aria-live="polite"
          >
            <div className="wallet-modal-header">
              {walletActionPrompt.state === "success" ? (
                <span className="wallet-modal-check" aria-hidden="true">
                  {"\u2713"}
                </span>
              ) : (
                <span className="wallet-modal-spinner" aria-hidden="true" />
              )}
              <h3>{walletActionPrompt.title}</h3>
            </div>
            <p>{walletActionPrompt.message}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default App;
