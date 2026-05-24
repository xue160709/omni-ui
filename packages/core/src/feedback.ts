import type { FeedbackPhase, FeedbackRequest } from "./types"

// 中文：语音执行反馈拆成“定位目标”和“按下目标”两步，方便 UI 做连续动画。
// English: Voice execution feedback is split into target and press phases so UI can render a two-step animation.
export function createVoiceActivationSequence(targetId: string): FeedbackRequest[] {
  return [
    { targetId, source: "voice", phase: "voice-target" },
    { targetId, source: "voice", phase: "voice-press" },
  ]
}

// 中文：终态反馈不会再继续排队，调用方可据此清理临时高亮。
// English: Terminal feedback phases do not enqueue further work, allowing callers to clear transient highlights.
export function isTerminalFeedbackPhase(phase: FeedbackPhase): boolean {
  return phase === "success" || phase === "error"
}
