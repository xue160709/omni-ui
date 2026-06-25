import * as React from "react"
import type { InteractionTrace, InteractionTurn } from "@omni-ui/core"
import {
  useActiveInteractionTurn,
  useInteractionTrace,
  useInteractionTurn,
} from "./runtime"

export type OmniDevToolsProps = {
  turnId?: string
  className?: string
}

export function OmniDevTools({ turnId, className }: OmniDevToolsProps) {
  const activeTurn = useActiveInteractionTurn()
  const inspectedTurn = useInteractionTurn(turnId ?? activeTurn?.id)
  const trace = useInteractionTrace(inspectedTurn?.id)
  const diagnostics = diagnoseInteractionTurn(inspectedTurn)

  if (!inspectedTurn) {
    return (
      <section className={className} data-omni-devtools="">
        <h2>OmniUI DevTools</h2>
        <p>No active turn</p>
      </section>
    )
  }

  return (
    <section className={className} data-omni-devtools="">
      <h2>OmniUI DevTools</h2>
      <TurnSummary turn={inspectedTurn} />
      <TraceSummary trace={trace} />
      <DiagnosticSummary diagnostics={diagnostics} />
    </section>
  )
}

function TurnSummary({ turn }: { turn: InteractionTurn }) {
  return (
    <div data-omni-devtools-panel="turn">
      <h3>Current Turn</h3>
      <dl>
        <dt>turnId</dt>
        <dd>{turn.id}</dd>
        <dt>revision</dt>
        <dd>{turn.revision}</dd>
        <dt>status</dt>
        <dd>{turn.status}</dd>
        <dt>contextEpoch</dt>
        <dd>{turn.contextEpoch}</dd>
        <dt>snapshot</dt>
        <dd>{turn.anchor.snapshotId}</dd>
      </dl>
      <h3>Fusion</h3>
      <ol>
        {turn.candidates.map((candidate) => (
          <li key={candidate.id}>
            <code>{candidate.targetId}</code>{" "}
            <span>{candidate.actionId ?? candidate.primitiveAction ?? "none"}</span>{" "}
            <strong>{candidate.score.toFixed(2)}</strong>
            {candidate.rejected ? <em>{candidate.rejected.code}</em> : null}
          </li>
        ))}
      </ol>
      {turn.decision ? (
        <p>
          <strong>decision</strong> <code>{turn.decision.targetId}</code>{" "}
          {turn.decision.actionId ?? turn.decision.primitiveAction}
        </p>
      ) : null}
    </div>
  )
}

function TraceSummary({ trace }: { trace?: InteractionTrace }) {
  if (!trace) return null
  return (
    <div data-omni-devtools-panel="trace">
      <h3>Trace</h3>
      <ol>
        {trace.phases.map((phase, index) => (
          <li key={`${phase.name}:${index}`}>
            <span>{phase.name}</span> <code>{phase.outcome ?? "started"}</code>
          </li>
        ))}
      </ol>
      {trace.resultStatus ? <p>{trace.resultStatus}</p> : null}
    </div>
  )
}

function DiagnosticSummary({ diagnostics }: { diagnostics: OmniDevToolsDiagnostic[] }) {
  if (diagnostics.length === 0) return null
  return (
    <div data-omni-devtools-panel="diagnostics">
      <h3>Diagnostics</h3>
      <ul>
        {diagnostics.map((diagnostic) => (
          <li key={diagnostic.code}>
            <strong>{diagnostic.severity}</strong> <code>{diagnostic.code}</code>{" "}
            {diagnostic.message}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function exportSanitizedInteractionTrace(trace: InteractionTrace): string {
  return JSON.stringify(
    {
      ...trace,
      candidateSummaries: trace.candidateSummaries.map((candidate) => ({
        ...candidate,
        evidenceTypes: candidate.evidenceTypes,
      })),
    },
    null,
    2
  )
}

export type OmniDevToolsDiagnostic = {
  code: string
  severity: "info" | "warning" | "error"
  message: string
}

export function diagnoseInteractionTurn(
  turn: InteractionTurn | undefined
): OmniDevToolsDiagnostic[] {
  if (!turn) {
    return [
      {
        code: "OMNI_TURN_MISSING",
        severity: "warning",
        message: "No active InteractionTurn is available.",
      },
    ]
  }

  const diagnostics: OmniDevToolsDiagnostic[] = []
  if (turn.status === "ready" && !turn.decision) {
    diagnostics.push({
      code: "OMNI_DECISION_MISSING",
      severity: "error",
      message: "Ready turn has no decision.",
    })
  }
  if (turn.status === "awaiting_confirmation" && !turn.pendingCommand) {
    diagnostics.push({
      code: "OMNI_PENDING_COMMAND_MISSING",
      severity: "error",
      message: "Confirmation turn has no frozen pending command.",
    })
  }
  if (turn.result && !turn.result.commandId) {
    diagnostics.push({
      code: "OMNI_RESULT_COMMAND_MISSING",
      severity: "error",
      message: "Dispatch result is missing command provenance.",
    })
  }
  if (turn.phaseHistory.length === 0) {
    diagnostics.push({
      code: "OMNI_PHASE_HISTORY_EMPTY",
      severity: "warning",
      message: "Turn has no phase history.",
    })
  }
  return diagnostics
}
