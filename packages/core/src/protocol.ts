import type { CommandEnvelope, DispatchResult } from "./command"
import type { ResolutionBundle } from "./resolution"

export const OMNI_UI_PROTOCOL_VERSION = "1.0" as const
export const OMNI_UI_SUPPORTED_PROTOCOL_VERSIONS = [OMNI_UI_PROTOCOL_VERSION] as const

export type OmniProtocolVersion = (typeof OMNI_UI_SUPPORTED_PROTOCOL_VERSIONS)[number]

export type ProtocolNegotiationResult =
  | {
      status: "compatible"
      version: OmniProtocolVersion
    }
  | {
      status: "incompatible"
      requested: string[]
      supported: readonly OmniProtocolVersion[]
    }

export type ResolutionBundleProtocolEnvelope = {
  protocolVersion: OmniProtocolVersion
  kind: "resolution_bundle"
  bundle: Pick<
    ResolutionBundle,
    | "turnId"
    | "resolutionRevision"
    | "anchor"
    | "resolverIds"
    | "hypotheses"
    | "fusion"
    | "fusionSummary"
    | "startedAt"
    | "completedAt"
  >
}

export type CommandProtocolEnvelope = {
  protocolVersion: OmniProtocolVersion
  kind: "command"
  command: CommandEnvelope
}

export type DispatchResultProtocolEnvelope = {
  protocolVersion: OmniProtocolVersion
  kind: "dispatch_result"
  result: DispatchResult
}

export type OmniProtocolEnvelope =
  | ResolutionBundleProtocolEnvelope
  | CommandProtocolEnvelope
  | DispatchResultProtocolEnvelope

export function negotiateProtocolVersion(
  requested: string | readonly string[] | undefined,
  supported: readonly OmniProtocolVersion[] = OMNI_UI_SUPPORTED_PROTOCOL_VERSIONS
): ProtocolNegotiationResult {
  const requestedVersions = normalizeRequestedVersions(requested)
  const version = requestedVersions.find((item): item is OmniProtocolVersion =>
    supported.includes(item as OmniProtocolVersion)
  )

  if (version) {
    return {
      status: "compatible",
      version,
    }
  }

  return {
    status: "incompatible",
    requested: requestedVersions,
    supported,
  }
}

export function serializeResolutionBundle(
  bundle: ResolutionBundle
): ResolutionBundleProtocolEnvelope {
  return {
    protocolVersion: OMNI_UI_PROTOCOL_VERSION,
    kind: "resolution_bundle",
    bundle: {
      turnId: bundle.turnId,
      resolutionRevision: bundle.resolutionRevision,
      anchor: bundle.anchor,
      resolverIds: bundle.resolverIds,
      hypotheses: bundle.hypotheses,
      fusion: bundle.fusion,
      fusionSummary: bundle.fusionSummary,
      startedAt: bundle.startedAt,
      completedAt: bundle.completedAt,
    },
  }
}

export function serializeCommand(command: CommandEnvelope): CommandProtocolEnvelope {
  return {
    protocolVersion: OMNI_UI_PROTOCOL_VERSION,
    kind: "command",
    command,
  }
}

export function serializeDispatchResult(
  result: DispatchResult
): DispatchResultProtocolEnvelope {
  return {
    protocolVersion: OMNI_UI_PROTOCOL_VERSION,
    kind: "dispatch_result",
    result,
  }
}

export function assertProtocolEnvelope(
  value: unknown
): asserts value is OmniProtocolEnvelope {
  if (!isRecord(value)) {
    throw new Error("Protocol envelope must be an object.")
  }
  if (value.protocolVersion !== OMNI_UI_PROTOCOL_VERSION) {
    throw new Error(`Unsupported OmniUI protocol version: ${String(value.protocolVersion)}`)
  }
  if (
    value.kind !== "resolution_bundle" &&
    value.kind !== "command" &&
    value.kind !== "dispatch_result"
  ) {
    throw new Error(`Unsupported OmniUI protocol envelope kind: ${String(value.kind)}`)
  }
}

function normalizeRequestedVersions(
  requested: string | readonly string[] | undefined
): string[] {
  if (!requested) return [...OMNI_UI_SUPPORTED_PROTOCOL_VERSIONS]
  return typeof requested === "string" ? [requested] : [...requested]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
