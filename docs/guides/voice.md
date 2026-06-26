# Voice

Voice support is optional. The first Quick Start uses local text commands and does not require microphone permission.

ASR integrations should use a voice adapter that emits partial and final `VoiceInput` events. Partials should remain previews; only final events should be submitted through the normal Turn and Dispatcher flow.

The same local validation, policy, confirmation, and executor path applies to voice, text, and model-assisted commands.
