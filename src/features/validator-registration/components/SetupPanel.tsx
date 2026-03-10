import { ChangeEvent, DragEvent } from "react";
import { NETWORK_OPTIONS, NetworkValue } from "../model/networks";
import {
  ALLOWED_OPERATOR_COUNTS,
  MAX_OPERATOR_COUNT,
  MIN_REQUIRED_OPERATOR_COUNT,
} from "../model/operators";
import { Address, FileParseReport } from "../model/types";
import { shortenAddress } from "../utils/format";

type SetupPanelProps = {
  selectedFiles: File[];
  fileParseReports: FileParseReport[];
  keystoreEntriesCount: number;
  isDragging: boolean;
  keystorePassword: string;
  network: NetworkValue;
  operatorInputs: string[];
  operatorValidationWarning: string | null;
  operatorInvalidIndexes: number[];
  duplicateOperatorIds: Set<number>;
  operatorAccessError: string | null;
  privateOperatorIds: string[];
  blockedPrivateOperatorIds: string[];
  walletAddress: Address | null;
  walletChainId: number | null;
  selectedNetworkLabel: string;
  connectError: string | null;
  isGenerating: boolean;
  isRegistering: boolean;
  onDrop: (event: DragEvent<HTMLLabelElement>) => void;
  onDragOver: (event: DragEvent<HTMLLabelElement>) => void;
  onDragLeave: (event: DragEvent<HTMLLabelElement>) => void;
  onFileInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onKeystorePasswordChange: (value: string) => void;
  onNetworkChange: (value: NetworkValue) => void;
  onAddOperatorInput: () => void;
  onUpdateOperatorInput: (index: number, value: string) => void;
  onRemoveOperatorInput: (index: number) => void;
  onToggleWalletConnection: () => void;
};

export function SetupPanel(props: SetupPanelProps) {
  return (
    <section className="card setup-card">
      <h2>Setup</h2>
      <p className="section-copy">
        Provide validator credentials and chain context before generating
        keyshares.
      </p>

      <div className="field-block">
        <span className="field-label">Keystore file upload</span>
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
            {props.fileParseReports.map((report) => (
              <li
                key={report.fileName}
                className={`file-item ${report.errors.length > 0 ? "has-error" : ""}`}
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
          Parsed validator keys: <strong>{props.keystoreEntriesCount}</strong>
        </p>
      </div>

      <div className="field-block">
        <label className="field-label" htmlFor="keystore-password">
          Keystore password
        </label>
        <input
          id="keystore-password"
          type="password"
          value={props.keystorePassword}
          onChange={(event) => props.onKeystorePasswordChange(event.target.value)}
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
          value={props.network}
          onChange={(event) => props.onNetworkChange(event.target.value as NetworkValue)}
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
            onClick={props.onAddOperatorInput}
            disabled={
              props.operatorInputs.length >= MAX_OPERATOR_COUNT ||
              props.isGenerating ||
              props.isRegistering
            }
          >
            + Add operator
          </button>
        </div>
        <p className="hint">
          Allowed sizes: {ALLOWED_OPERATOR_COUNTS.join(", ")} operators.
        </p>
        <p className="hint">
          The first {MIN_REQUIRED_OPERATOR_COUNT} operator slots are mandatory and
          cannot be removed.
        </p>

        <div className="operator-input-list">
          {props.operatorInputs.map((value, index) => {
            const parsedValue = Number(value.trim());
            const hasNumericValue = Number.isInteger(parsedValue) && parsedValue > 0;
            const isInvalidId = props.operatorInvalidIndexes.includes(index);
            const isDuplicateId =
              hasNumericValue && props.duplicateOperatorIds.has(parsedValue);

            return (
              <div key={`operator-input-${index}`} className="operator-input-row">
                <input
                  className={`operator-id-input ${
                    isInvalidId || isDuplicateId ? "invalid" : ""
                  }`}
                  value={value}
                  onChange={(event) =>
                    props.onUpdateOperatorInput(index, event.target.value)
                  }
                  placeholder={`Operator ID #${index + 1}`}
                  inputMode="numeric"
                />
                <button
                  type="button"
                  className="button secondary operator-remove"
                  onClick={() => props.onRemoveOperatorInput(index)}
                  disabled={
                    index < MIN_REQUIRED_OPERATOR_COUNT ||
                    props.operatorInputs.length <= MIN_REQUIRED_OPERATOR_COUNT ||
                    props.isGenerating ||
                    props.isRegistering
                  }
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>

        {props.operatorValidationWarning ? (
          <p className="error-text">
            {props.operatorValidationWarning} Add or remove operators to continue.
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

      <div className="field-block wallet-block">
        <span className="field-label">Wallet connection (WalletConnect)</span>
        <div className="wallet-row">
          <button
            type="button"
            className="button secondary"
            onClick={props.onToggleWalletConnection}
            disabled={props.isGenerating || props.isRegistering}
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
        {props.connectError ? <p className="error-text">{props.connectError}</p> : null}
      </div>
    </section>
  );
}
