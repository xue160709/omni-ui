# Privacy

OmniUI snapshots are structured runtime data, not application source code. Sensitive inputs such as passwords, OTPs, API keys, tokens, cookies, and payment secrets are redacted before model projection and trace export.

By default, form input values are summarized as shape metadata such as `hasValue`, length, and input type. Action params in traces should be treated as summaries unless an app explicitly opts into richer diagnostics.

LLM raw responses are proposals and should not be persisted as authoritative runtime facts. Use sanitized `InteractionTrace` exports for bug reports and DevTools diagnostics.
