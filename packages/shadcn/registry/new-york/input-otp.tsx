"use client"

import * as React from "react"
import {
  InputOTP as ShadcnInputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp"
import { useInteractionNode, type InteractionHint } from "@multimodal-ui/react"
import { composeRefs } from "./utils"

type MultimodalInputOTPProps = React.ComponentProps<typeof ShadcnInputOTP> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

// 中文：InputOTP 作为一次性验证码文本输入暴露 setText/clear/focus。
// English: InputOTP is exposed as a one-time-code textbox with setText/clear/focus.
export const MultimodalInputOTP = React.forwardRef<
  React.ElementRef<typeof ShadcnInputOTP>,
  MultimodalInputOTPProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnInputOTP>>({
    id: interactionId,
    role: "textbox",
    label: interactionLabel,
    labelFrom: "aria",
    actions: ["focus", "setText", "clear"],
    hint: interactionHint,
  })

  return <ShadcnInputOTP ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalInputOTP.displayName = "MultimodalInputOTP"

export { InputOTPGroup, InputOTPSeparator, InputOTPSlot }

