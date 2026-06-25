import type { CommandEnvelope, ConfirmationGrant } from "./command"

export type CreateConfirmationGrantOptions = {
  grantId?: string
  nonce?: string
  now?: number
  expiresInMs?: number
  confirmedBy?: ConfirmationGrant["confirmedBy"]
}

export function createConfirmationGrant(
  command: CommandEnvelope,
  options: CreateConfirmationGrantOptions = {}
): ConfirmationGrant {
  const issuedAt = options.now ?? Date.now()
  const expiresAt = issuedAt + (options.expiresInMs ?? 30_000)

  return {
    grantId: options.grantId ?? `grant_${command.commandId}_${issuedAt}`,
    turnId: command.turnId,
    commandId: command.commandId,
    decisionBinding: command.decisionBinding,
    bindingCanonical: command.decisionBinding.canonical,
    bindingFingerprint: command.decisionBinding.fingerprint,
    nonce: options.nonce ?? createNonce(command.commandId, issuedAt),
    issuedAt,
    grantedAt: issuedAt,
    expiresAt,
    confirmedBy: options.confirmedBy,
  }
}

export function confirmationGrantMatchesCommand(
  confirmation: ConfirmationGrant | undefined,
  command: CommandEnvelope,
  now = Date.now()
): boolean {
  if (!confirmation) return false
  if (confirmation.expiresAt && confirmation.expiresAt <= now) return false

  const canonical = confirmation.bindingCanonical ?? confirmation.decisionBinding.canonical
  const fingerprint =
    confirmation.bindingFingerprint ?? confirmation.decisionBinding.fingerprint

  return (
    confirmation.turnId === command.turnId &&
    confirmation.commandId === command.commandId &&
    canonical === command.decisionBinding.canonical &&
    fingerprint === command.decisionBinding.fingerprint
  )
}

function createNonce(commandId: string, issuedAt: number): string {
  return `${commandId}:${issuedAt}:${Math.random().toString(36).slice(2, 10)}`
}
