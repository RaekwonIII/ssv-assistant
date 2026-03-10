import { useMemo, useState } from "react";
import "./App.css";
import { SetupPanel } from "./features/validator-registration/components/SetupPanel";
import { ExecutionPanel } from "./features/validator-registration/components/ExecutionPanel";
import {
  NetworkValue,
  getNetworkOption,
} from "./features/validator-registration/model/networks";
import { getBatchLimitForOperatorCount } from "./features/validator-registration/model/operators";
import { useActivityLog } from "./features/validator-registration/hooks/useActivityLog";
import { useKeystoreUpload } from "./features/validator-registration/hooks/useKeystoreUpload";
import { useOperatorInputs } from "./features/validator-registration/hooks/useOperatorInputs";
import { useRegistrationFlow } from "./features/validator-registration/hooks/useRegistrationFlow";
import { useWalletConnection } from "./features/validator-registration/hooks/useWalletConnection";
import { createBatchPlan } from "./features/validator-registration/utils/batching";

function App() {
  const [network, setNetwork] = useState<NetworkValue>("mainnet");
  const [keystorePassword, setKeystorePassword] = useState("");
  const [depositAmountEth, setDepositAmountEth] = useState("0");

  const selectedNetwork = getNetworkOption(network);

  const { activityLog, appendActivity } = useActivityLog();

  const {
    operatorInputs,
    operatorValidation,
    selectedOperatorIds,
    duplicateOperatorIds,
    updateOperatorInput,
    addOperatorInput,
    removeOperatorInput,
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
  } = useKeystoreUpload({
    appendActivity,
  });

  const {
    walletAddress,
    walletChainId,
    walletProvider,
    connectError,
    setWalletChainId,
    toggleWalletConnection,
  } = useWalletConnection({
    appendActivity,
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
    generationError,
    registrationError,
    canGenerateKeyshares,
    canQueueTransactions,
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
  });

  const validatorCount =
    generatedKeyshares.length > 0 ? generatedKeyshares.length : keystoreEntries.length;
  const plannedBatches = useMemo(
    () => createBatchPlan(validatorCount, maxKeysPerTx),
    [validatorCount, maxKeysPerTx],
  );
  const displayedBatches = queueBatches.length > 0 ? queueBatches : plannedBatches;

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
          onAddOperatorInput={addOperatorInput}
          onUpdateOperatorInput={updateOperatorInput}
          onRemoveOperatorInput={removeOperatorInput}
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
          canGenerateKeyshares={canGenerateKeyshares}
          canQueueTransactions={canQueueTransactions}
          isGenerating={isGenerating}
          isRegistering={isRegistering}
          onGenerateKeyshares={() => void handleGenerateKeyshares()}
          onQueueTransactions={() => void handleQueueRegistration()}
          generationError={generationError}
          registrationError={registrationError}
          activityLog={activityLog}
          setupSteps={setupSteps}
        />
      </main>
    </div>
  );
}

export default App;
