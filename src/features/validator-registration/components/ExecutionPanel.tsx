import { getTxExplorerUrl, NetworkOption } from "../model/networks";
import {
  ActivityEvent,
  Batch,
  OperatorSnapshot,
  ValidationSummary,
} from "../model/types";
import { shortenAddress } from "../utils/format";

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
  canGenerateKeyshares: boolean;
  canQueueTransactions: boolean;
  isGenerating: boolean;
  isRegistering: boolean;
  onGenerateKeyshares: () => void;
  onQueueTransactions: () => void;
  generationError: string | null;
  registrationError: string | null;
  activityLog: ActivityEvent[];
  setupSteps: SetupStep[];
};

export function ExecutionPanel(props: ExecutionPanelProps) {
  return (
    <section className="card planner-card">
      <h2>Execution Plan</h2>
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

      <div className="field-block">
        <label className="field-label" htmlFor="deposit-amount">
          Deposit amount per transaction (ETH)
        </label>
        <input
          id="deposit-amount"
          type="text"
          value={props.depositAmountEth}
          onChange={(event) => props.onDepositAmountChange(event.target.value)}
          placeholder="0.0"
        />
        <p className="hint">
          The SDK passes this value as `depositAmount` in each
          `registerValidators` call.
        </p>
      </div>

      {props.validationSummary ? (
        <div className="status-banner">
          <span>Validation</span>
          <strong>{props.validationSummary.available} available</strong>
          <small>
            {props.validationSummary.registered} registered, {" "}
            {props.validationSummary.incorrect} incorrect
          </small>
        </div>
      ) : null}

      {props.operatorSnapshot ? (
        <div className="operator-table">
          <div className="queue-header">
            <span>Fetched operators</span>
            <span>Data from sdk.api.getOperators</span>
          </div>
          <ul>
            {props.operatorSnapshot.map((operator) => (
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
          disabled={!props.canGenerateKeyshares}
          onClick={props.onGenerateKeyshares}
        >
          {props.isGenerating ? "Generating keyshares..." : "Generate keyshares"}
        </button>
        <button
          type="button"
          className="button accent"
          disabled={!props.canQueueTransactions}
          onClick={props.onQueueTransactions}
        >
          {props.isRegistering
            ? "Submitting registration queue..."
            : "Queue registration transactions"}
        </button>
      </div>

      {props.generationError ? <p className="error-text">{props.generationError}</p> : null}
      {props.registrationError ? (
        <p className="error-text">{props.registrationError}</p>
      ) : null}

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
        {props.setupSteps.map((step) => (
          <li key={step.label} className={step.complete ? "complete" : "pending"}>
            {step.label}
          </li>
        ))}
      </ul>

      <p className="footnote">
        Queue behavior: wait for each transaction receipt before sending the next
        batch to avoid nonce conflicts and preserve deterministic retry.
      </p>
    </section>
  );
}
