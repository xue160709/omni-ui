"use client"

import * as React from "react"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem as ShadcnDropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger as ShadcnDropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useInteractionNode, type InteractionHint } from "@multimodal-ui/react"
import { composeRefs } from "./utils"

type MultimodalDropdownMenuTriggerProps = React.ComponentProps<typeof ShadcnDropdownMenuTrigger> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

export const MultimodalDropdownMenuTrigger = React.forwardRef<
  React.ElementRef<typeof ShadcnDropdownMenuTrigger>,
  MultimodalDropdownMenuTriggerProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnDropdownMenuTrigger>>({
    id: interactionId,
    role: "button",
    label: interactionLabel,
    labelFrom: "text",
    actions: ["open", "press"],
    hint: interactionHint,
  })

  return <ShadcnDropdownMenuTrigger ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalDropdownMenuTrigger.displayName = "MultimodalDropdownMenuTrigger"

type MultimodalDropdownMenuItemProps = React.ComponentProps<typeof ShadcnDropdownMenuItem> & {
  interactionId?: string
  interactionLabel?: string
  interactionHint?: InteractionHint
}

export const MultimodalDropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof ShadcnDropdownMenuItem>,
  MultimodalDropdownMenuItemProps
>(({ interactionId, interactionLabel, interactionHint, ...props }, ref) => {
  const mmRef = useInteractionNode<React.ElementRef<typeof ShadcnDropdownMenuItem>>({
    id: interactionId,
    role: "menuitem",
    label: interactionLabel,
    labelFrom: "text",
    actions: ["select", "press"],
    hint: interactionHint,
  })

  return <ShadcnDropdownMenuItem ref={composeRefs(ref, mmRef)} {...props} />
})
MultimodalDropdownMenuItem.displayName = "MultimodalDropdownMenuItem"

export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
}
