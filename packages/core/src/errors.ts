export type OmniErrorStage =
  | "voice"
  | "snapshot"
  | "manifest"
  | "turn"
  | "resolution"
  | "fusion"
  | "validation"
  | "policy"
  | "confirmation"
  | "dispatch"
  | "execution"
  | "verification"
  | "adapter"

export interface OmniError {
  code: string
  message: string
  stage: OmniErrorStage
  recoverable: boolean
  retryable?: boolean
  details?: Record<string, unknown>
  cause?: unknown
}

export const omniErrorCodes = {
  providerMissing: "OMNI_PROVIDER_MISSING",
  pageNotFound: "OMNI_PAGE_NOT_FOUND",
  entityIdInvalid: "OMNI_ENTITY_ID_INVALID",
  actionDuplicated: "OMNI_ACTION_DUPLICATED",
  actionNotFound: "OMNI_ACTION_NOT_FOUND",
  executorMissing: "OMNI_EXECUTOR_MISSING",
  turnNotFound: "OMNI_TURN_NOT_FOUND",
  turnTerminal: "OMNI_TURN_TERMINAL",
  turnRevisionConflict: "OMNI_TURN_REVISION_CONFLICT",
  turnSuperseded: "OMNI_TURN_SUPERSEDED",
  contextEpochChanged: "OMNI_CONTEXT_EPOCH_CHANGED",
  resolutionNoMatch: "OMNI_RESOLUTION_NO_MATCH",
  resolutionStale: "OMNI_RESOLUTION_STALE",
  fusionAmbiguousTarget: "OMNI_FUSION_AMBIGUOUS_TARGET",
  fusionAmbiguousAction: "OMNI_FUSION_AMBIGUOUS_ACTION",
  argumentValidationFailed: "OMNI_ARGUMENT_VALIDATION_FAILED",
  commandProvenanceInvalid: "OMNI_COMMAND_PROVENANCE_INVALID",
  commandConflictLocked: "OMNI_COMMAND_CONFLICT_LOCKED",
  policyRejected: "OMNI_POLICY_REJECTED",
  confirmationRequired: "OMNI_CONFIRMATION_REQUIRED",
  confirmationInvalid: "OMNI_CONFIRMATION_INVALID",
  executionFailed: "OMNI_EXECUTION_FAILED",
  dispatchCancelled: "OMNI_DISPATCH_CANCELLED",
  verificationFailed: "OMNI_VERIFICATION_FAILED",
  snapshotTooLarge: "OMNI_SNAPSHOT_TOO_LARGE",
  adapterTimeout: "OMNI_ADAPTER_TIMEOUT",
} as const

export function createOmniError(input: OmniError): OmniError {
  return input
}

export function sanitizeOmniError(error: OmniError): OmniError {
  const { cause: _cause, ...safe } = error
  return safe
}
