import {
  getOperatorExplorerUrl,
  getTxExplorerUrl,
  NetworkOption,
} from "../model/networks";
import {
  ActivityEvent,
  Batch,
  OperatorSnapshot,
  ValidationSummary,
} from "../model/types";
import { shortenAddress, shortenPublicKey } from "../utils/format";

type SetupStep = {
  label: string;
  complete: boolean;
};

type ExecutionPanelProps = {
  operatorCount: number;
  operatorValidationIsValid: boolean;
  selectedOperatorIds: number[];
  operatorInputs: string[];
  maxKeysPerTx: number;
  displayedBatches: Batch[];
  validatorCount: number;
  depositAmountEth: string;
  onDepositAmountChange: (value: string) => void;
  validationSummary: ValidationSummary | null;
  operatorSnapshot: OperatorSnapshot[] | null;
  selectedNetwork: NetworkOption;
  hasGeneratedKeyshares: boolean;
  canGenerateKeyshares: boolean;
  canQueueTransactions: boolean;
  isGenerating: boolean;
  isRegistering: boolean;
  registrationPhase: "idle" | "running" | "completed" | "failed";
  queuedBatchCount: number;
  confirmedBatchCount: number;
  canStartNewRun: boolean;
  onGenerateKeyshares: () => void;
  onQueueTransactions: () => void;
  onStartNewRun: () => void;
  generateDisabledReason: string | null;
  queueDisabledReason: string | null;
  activityLog: ActivityEvent[];
  setupSteps: SetupStep[];
};

export function ExecutionPanel(props: ExecutionPanelProps) {
  const registrationStatusLabel =
    props.registrationPhase === "running"
      ? "Running"
      : props.registrationPhase === "completed"
        ? "Completed"
        : props.registrationPhase === "failed"
          ? "Failed"
          : "Not started";
  const showNextStepHint =
    props.hasGeneratedKeyshares && !props.isGenerating && !props.canStartNewRun;
  const isKeysharesReadyState =
    props.hasGeneratedKeyshares && props.registrationPhase === "idle";
  const hasValidationSummary = props.validationSummary !== null;
  const validationSummary = props.validationSummary;
  const generateButtonClass = `button ${
    props.hasGeneratedKeyshares ? "secondary" : "primary"
  } ${props.isGenerating ? "is-loading" : ""}`;
  const generateButtonLabel = props.isGenerating
    ? "Generating keyshares..."
    : props.hasGeneratedKeyshares
      ? "Regenerate keyshares"
      : "Generate keyshares";
  const hasValidDepositValue =
    props.depositAmountEth.trim().length > 0 &&
    Number.isFinite(Number(props.depositAmountEth)) &&
    Number(props.depositAmountEth) >= 0;
  const canAccessStep5 =
    props.canGenerateKeyshares || props.hasGeneratedKeyshares || props.isGenerating;
  const canAccessStep6 = props.hasGeneratedKeyshares;
  const canAccessStep7 = canAccessStep6 && hasValidDepositValue;

  return (
    <section className="card planner-card">
      <h2>Keyshares Generation and Registration</h2>
      <p className="section-copy">
        Review batch sizing and transaction queue behavior before submitting.
      </p>

      <div className="stats-grid">
        <article className="stat-card">
          <span>Cluster size</span>
          <strong>{props.operatorCount} operators</strong>
          <small>
            {props.operatorValidationIsValid
              ? props.selectedOperatorIds.join(", ")
              : props.operatorInputs.join(", ")}
          </small>
        </article>
        <article className="stat-card">
          <span>Batch limit</span>
          <strong>
            {props.maxKeysPerTx > 0 ? `${props.maxKeysPerTx} keys / tx` : "Unavailable"}
          </strong>
          <small>
            {props.maxKeysPerTx > 0
              ? `Rule for ${props.operatorCount} operators`
              : "Choose 4, 7, 10, or 13 operators"}
          </small>
        </article>
        <article className="stat-card">
          <span>Planned batches</span>
          <strong>{props.displayedBatches.length}</strong>
          <small>{props.validatorCount} validator keys</small>
        </article>
      </div>

      <div className={`field-block ${canAccessStep5 ? "" : "is-locked"}`}>
        <div className="step-heading">
          <span className="step-chip">Step 5</span>
          <strong>Generate Keyshares</strong>
        </div>
        <button
          type="button"
          className={generateButtonClass}
          disabled={!props.canGenerateKeyshares}
          onClick={props.onGenerateKeyshares}
          aria-busy={props.isGenerating}
        >
          {props.isGenerating ? (
            <span className="button-progress-fill" aria-hidden="true" />
          ) : null}
          <span className="button-label">{generateButtonLabel}</span>
        </button>
        {!props.canGenerateKeyshares && props.generateDisabledReason ? (
          <p className="hint action-hint">{props.generateDisabledReason}</p>
        ) : null}
      </div>

      <div
        className={`status-banner queue-status ${
          hasValidationSummary ? props.registrationPhase : "neutral"
        } ${isKeysharesReadyState ? "keyshares-ready" : ""} ${
          canAccessStep6 ? "" : "is-locked"
        }`}
      >
        <span>{isKeysharesReadyState ? "Keyshares" : "Validation"}</span>
        <strong>
          {isKeysharesReadyState
            ? "Keyshares ready"
            : hasValidationSummary
              ? `${validationSummary?.available ?? 0} available`
              : "Not started"}
        </strong>
        <small>
          {hasValidationSummary
            ? `${validationSummary?.available ?? 0} available, ${validationSummary?.registered ?? 0} registered, ${validationSummary?.incorrect ?? 0} incorrect`
            : "Generate keyshares to run pre-registration checks."}
        </small>
        <small>
          Registration queue {registrationStatusLabel.toLowerCase()}:{" "}
          {props.confirmedBatchCount}/{props.queuedBatchCount} confirmed batches
        </small>
        {props.registrationPhase === "idle" && props.hasGeneratedKeyshares ? (
          <small className="status-detail">
            Next step: click Register validators to submit transactions on-chain.
          </small>
        ) : null}
      </div>

      <div className={`operator-table ${canAccessStep6 ? "" : "is-locked"}`}>
        <div className="queue-header">
          <span>Fetched operators</span>
        </div>
        {props.operatorSnapshot && props.operatorSnapshot.length > 0 ? (
          <ul>
            {props.operatorSnapshot.map((operator) => {
              const operatorExplorerUrl = getOperatorExplorerUrl(
                props.selectedNetwork,
                operator.id,
              );

              return (
                <li key={operator.id}>
                  <span>
                    {operatorExplorerUrl ? (
                      <a
                        href={operatorExplorerUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="operator-id-link"
                      >
                        #{operator.id}
                      </a>
                    ) : (
                      `#${operator.id}`
                    )}
                  </span>
                  <span>{shortenPublicKey(operator.publicKey)}</span>
                  <span
                    className={`operator-visibility-tag ${
                      operator.isPrivate ? "private" : "public"
                    }`}
                  >
                    {operator.isPrivate ? "private" : "public"}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="hint">Operators will appear here after keyshare generation.</p>
        )}
      </div>

      <div className={`field-block ${canAccessStep6 ? "" : "is-locked"}`}>
        <div className="step-heading with-assist">
          <div className="step-title">
            <span className="step-chip">Step 6</span>
            <strong>Set Deposit Amount</strong>
          </div>
          <a
            href="https://ssv-eth-forecasting.vercel.app/"
            target="_blank"
            rel="noreferrer"
            className="step-assist-link"
          >
            Not sure how much to deposit?
          </a>
        </div>
        <label className="field-label" htmlFor="deposit-amount">
          Deposit amount per transaction (ETH)
        </label>
        <input
          id="deposit-amount"
          type="text"
          value={props.depositAmountEth}
          disabled={!canAccessStep6 || props.isGenerating || props.isRegistering}
          onChange={(event) => props.onDepositAmountChange(event.target.value)}
          placeholder="0.0"
        />
        {!canAccessStep6 ? (
          <p className="hint section-lock">Complete Step 5 to unlock this section.</p>
        ) : null}
      </div>

      <div className={`field-block ${canAccessStep7 ? "" : "is-locked"}`}>
        <div className="step-heading">
          <span className="step-chip">Step 7</span>
          <strong>Queue Transactions</strong>
        </div>
        <button
          type="button"
          className={`button accent ${showNextStepHint ? "next-step" : ""}`}
          disabled={!props.canStartNewRun && !props.canQueueTransactions}
          onClick={
            props.canStartNewRun ? props.onStartNewRun : props.onQueueTransactions
          }
        >
          {props.canStartNewRun
            ? "Register new validators"
            : props.isRegistering
              ? "Registering validators..."
              : "Register validators"}
        </button>
        {!props.canStartNewRun &&
        !props.canQueueTransactions &&
        props.queueDisabledReason ? (
          <p className="hint action-hint">{props.queueDisabledReason}</p>
        ) : null}
        {!canAccessStep7 ? (
          <p className="hint section-lock">Complete Step 6 to unlock this section.</p>
        ) : null}
      </div>

      <div className="batch-queue">
        <div className="queue-header">
          <span>Transaction queue</span>
          <span>Status flow</span>
        </div>
        {props.displayedBatches.length === 0 ? (
          <p className="hint">
            Upload and parse keystores to preview automatic transaction batching.
          </p>
        ) : (
          <ul>
            {props.displayedBatches.map((batch) => (
              <li key={batch.id}>
                <span>Batch {batch.id}</span>
                <span>
                  Keys {batch.start}-{batch.end} ({batch.size})
                </span>
                <span className={`batch-state ${batch.status}`}>{batch.status}</span>
                {batch.txHash ? (
                  <a
                    href={getTxExplorerUrl(props.selectedNetwork, batch.txHash) ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="tx-link"
                  >
                    {shortenAddress(batch.txHash)}
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="activity-feed">
        <div className="queue-header">
          <span>Activity</span>
          <span>Latest first</span>
        </div>
        {props.activityLog.length === 0 ? (
          <p className="hint">No actions executed yet.</p>
        ) : (
          <ul>
            {props.activityLog.map((event) => (
              <li key={event.id} className={`log-item ${event.level}`}>
                {event.message}
              </li>
            ))}
          </ul>
        )}
      </div>

      <ul className="step-list">
        {props.setupSteps.map((step, index) => (
          <li key={step.label} className={step.complete ? "complete" : "pending"}>
            Step {index + 1}: {step.label}
          </li>
        ))}
      </ul>

    </section>
  );
}
