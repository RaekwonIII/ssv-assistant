import { ChangeEvent, DragEvent, useEffect, useRef } from "react";
import { NETWORK_OPTIONS, NetworkValue } from "../model/networks";
import { ALLOWED_OPERATOR_COUNTS } from "../model/operators";
import { Address, FileParseReport } from "../model/types";
import { shortenAddress } from "../utils/format";

type SetupPanelProps = {
  selectedFiles: File[];
  fileParseReports: FileParseReport[];
  keystoreEntriesCount: number;
  isDragging: boolean;
  keystorePassword: string;
  keystorePasswordError: string | null;
  network: NetworkValue;
  operatorInputs: string[];
  operatorValidationWarning: string | null;
  operatorInvalidIndexes: number[];
  duplicateOperatorIds: Set<number>;
  missingOperatorIds: number[];
  operatorAccessError: string | null;
  privateOperatorIds: string[];
  blockedPrivateOperatorIds: string[];
  walletAddress: Address | null;
  walletSessionVerified: boolean;
  walletChainId: number | null;
  selectedNetworkLabel: string;
  connectError: string | null;
  isGenerating: boolean;
  isRegistering: boolean;
  onDrop: (event: DragEvent<HTMLLabelElement>) => void;
  onDragOver: (event: DragEvent<HTMLLabelElement>) => void;
  onDragLeave: (event: DragEvent<HTMLLabelElement>) => void;
  onFileInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveUploadedFileAtIndex: (index: number) => void;
  onClearUploadedFiles: () => void;
  onKeystorePasswordChange: (value: string) => void;
  onNetworkChange: (value: NetworkValue) => void;
  onOperatorCountChange: (count: number) => void;
  onUpdateOperatorInput: (index: number, value: string) => void;
  onToggleWalletConnection: () => void;
};

export function SetupPanel(props: SetupPanelProps) {
  const canAccessStep2 = props.keystoreEntriesCount > 0;
  const canAccessStep3 = canAccessStep2 && props.keystorePassword.trim().length > 0;
  const canAccessStep4 = canAccessStep3 && props.operatorValidationWarning === null;
  const passwordSectionRef = useRef<HTMLDivElement | null>(null);
  const operatorSectionRef = useRef<HTMLDivElement | null>(null);
  const previousMissingIdsRef = useRef<string>("");

  useEffect(() => {
    if (props.keystorePasswordError) {
      passwordSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [props.keystorePasswordError]);

  useEffect(() => {
    const missingIdsKey = props.missingOperatorIds.join(",");
    const hasNewMissingIds =
      missingIdsKey.length > 0 && missingIdsKey !== previousMissingIdsRef.current;

    if (hasNewMissingIds) {
      operatorSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }

    previousMissingIdsRef.current = missingIdsKey;
  }, [props.missingOperatorIds]);

  return (
    <section className="card setup-card">
      <h2>Setup</h2>
      <p className="section-copy">
        Provide validator credentials and chain context before generating
        keyshares.
      </p>

      <div className="field-block">
        <div className="step-heading">
          <span className="step-chip">Step 1</span>
          <strong>Upload Keystores</strong>
        </div>
        <div className="field-row">
          <span className="field-label">Keystore file upload</span>
          {props.selectedFiles.length > 0 ? (
            <button
              type="button"
              className="inline-action-button"
              onClick={props.onClearUploadedFiles}
              disabled={props.isGenerating || props.isRegistering}
            >
              Clear all
            </button>
          ) : null}
        </div>
        <label
          className={`dropzone ${props.isDragging ? "is-dragging" : ""}`}
          onDrop={props.onDrop}
          onDragOver={props.onDragOver}
          onDragLeave={props.onDragLeave}
        >
          <input
            type="file"
            accept=".json,application/json"
            multiple
            onChange={props.onFileInputChange}
          />
          <strong>Drop EIP-2335 files here</strong>
          <span>or click to browse local files</span>
        </label>
        {props.selectedFiles.length === 0 ? (
          <p className="hint">No keystore files selected yet.</p>
        ) : (
          <ul className="file-list">
            {props.fileParseReports.map((report, index) => (
              <li
                key={`${report.fileName}-${index}`}
                className={`file-item ${report.errors.length > 0 ? "has-error" : ""}`}
              >
                <div className="file-item-head">
                  <span>{report.fileName}</span>
                  <div className="file-item-actions">
                    <span>
                      {report.entryCount} key{report.entryCount === 1 ? "" : "s"}
                    </span>
                    <button
                      type="button"
                      className="file-remove-button"
                      onClick={() => props.onRemoveUploadedFileAtIndex(index)}
                      disabled={props.isGenerating || props.isRegistering}
                      aria-label={`Remove ${report.fileName}`}
                      title={`Remove ${report.fileName}`}
                    >
                      ×
                    </button>
                  </div>
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
          Parsed validator keys: <strong>{props.keystoreEntriesCount}</strong>
        </p>
      </div>

      <div
        ref={passwordSectionRef}
        className={`field-block ${canAccessStep2 ? "" : "is-locked"}`}
      >
        <div className="step-heading">
          <span className="step-chip">Step 2</span>
          <strong>Unlock and Select Network</strong>
        </div>
        <label className="field-label" htmlFor="keystore-password">
          Keystore password
        </label>
        <input
          id="keystore-password"
          className={props.keystorePasswordError ? "password-input invalid" : "password-input"}
          type="password"
          value={props.keystorePassword}
          disabled={!canAccessStep2 || props.isGenerating || props.isRegistering}
          onChange={(event) => props.onKeystorePasswordChange(event.target.value)}
          placeholder="Enter keystore password"
          autoComplete="off"
          aria-invalid={Boolean(props.keystorePasswordError)}
        />
        {props.keystorePasswordError ? (
          <p className="error-text">{props.keystorePasswordError}</p>
        ) : null}
        {!canAccessStep2 ? (
          <p className="hint section-lock">Complete Step 1 to unlock this section.</p>
        ) : null}
      </div>

      <div className={`field-block ${canAccessStep2 ? "" : "is-locked"}`}>
        <label className="field-label" htmlFor="network-select">
          Target network
        </label>
        <select
          id="network-select"
          value={props.network}
          disabled={!canAccessStep2 || props.isGenerating || props.isRegistering}
          onChange={(event) => props.onNetworkChange(event.target.value as NetworkValue)}
        >
          {NETWORK_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div
        ref={operatorSectionRef}
        className={`field-block ${canAccessStep3 ? "" : "is-locked"}`}
      >
        <div className="step-heading">
          <span className="step-chip">Step 3</span>
          <strong>Configure Operators</strong>
        </div>
        <div className="operator-controls">
          <span className="field-label">Operator set IDs</span>
          <select
            className="operator-count-select"
            value={props.operatorInputs.length}
            disabled={!canAccessStep3 || props.isGenerating || props.isRegistering}
            onChange={(event) =>
              props.onOperatorCountChange(Number.parseInt(event.target.value, 10))
            }
          >
            {ALLOWED_OPERATOR_COUNTS.map((count) => (
              <option key={count} value={count}>
                {count} operators
              </option>
            ))}
          </select>
        </div>
        <p className="hint">
          Allowed sizes: {ALLOWED_OPERATOR_COUNTS.join(", ")} operators.
        </p>

        <div
          className={`operator-input-list ${
            props.missingOperatorIds.length > 0 ? "has-missing" : ""
          }`}
        >
          {props.operatorInputs.map((value, index) => {
            const parsedValue = Number(value.trim());
            const hasNumericValue = Number.isInteger(parsedValue) && parsedValue > 0;
            const isInvalidId = props.operatorInvalidIndexes.includes(index);
            const isDuplicateId =
              hasNumericValue && props.duplicateOperatorIds.has(parsedValue);
            const isMissingId =
              hasNumericValue && props.missingOperatorIds.includes(parsedValue);

            return (
              <div key={`operator-input-${index}`} className="operator-input-row">
                <input
                  className={`operator-id-input ${
                    isInvalidId || isDuplicateId || isMissingId ? "invalid" : ""
                  }`}
                  value={value}
                  disabled={!canAccessStep3 || props.isGenerating || props.isRegistering}
                  onChange={(event) =>
                    props.onUpdateOperatorInput(index, event.target.value)
                  }
                  placeholder={`Operator ID #${index + 1}`}
                  inputMode="numeric"
                  aria-invalid={isInvalidId || isDuplicateId || isMissingId}
                />
              </div>
            );
          })}
        </div>

        {props.operatorValidationWarning ? (
          <p className="error-text">
            {props.operatorValidationWarning} Adjust the operator count or IDs to continue.
          </p>
        ) : null}
        {!canAccessStep3 ? (
          <p className="hint section-lock">
            Complete Step 2 to unlock operator configuration.
          </p>
        ) : null}

        {props.operatorAccessError ? (
          <p className="error-text">{props.operatorAccessError}</p>
        ) : null}

        {props.privateOperatorIds.length > 0 &&
        props.blockedPrivateOperatorIds.length === 0 ? (
          <p className="hint">
            Private operators selected ({props.privateOperatorIds.join(", ")}).
            Connected wallet is whitelisted.
          </p>
        ) : null}
      </div>

      <div className={`field-block wallet-block ${canAccessStep4 ? "" : "is-locked"}`}>
        <div className="step-heading">
          <span className="step-chip">Step 4</span>
          <strong>Connect Wallet</strong>
        </div>
        <span className="field-label">Wallet connection (WalletConnect)</span>
        <div className="wallet-row">
          <button
            type="button"
            className="button secondary"
            onClick={props.onToggleWalletConnection}
            disabled={!canAccessStep4 || props.isGenerating || props.isRegistering}
          >
            {props.walletAddress
              ? "Disconnect wallet"
              : "Connect with WalletConnect"}
          </button>
          <span
            className={`wallet-pill ${
              props.walletAddress ? "connected" : "disconnected"
            }`}
          >
            {props.walletAddress
              ? `Connected: ${shortenAddress(props.walletAddress)}`
              : "Not connected"}
          </span>
        </div>
        {props.walletChainId !== null && props.walletAddress ? (
          <p className="hint">
            Wallet chain ID: {props.walletChainId} ({props.selectedNetworkLabel})
          </p>
        ) : null}
        {props.walletAddress ? (
          <p className="hint">
            Session check: {props.walletSessionVerified ? "verified" : "not verified"}
          </p>
        ) : null}
        {!canAccessStep4 ? (
          <p className="hint section-lock">
            Enter password and fix operator input warnings before connecting.
          </p>
        ) : null}
        {props.connectError ? <p className="error-text">{props.connectError}</p> : null}
      </div>
    </section>
  );
}
