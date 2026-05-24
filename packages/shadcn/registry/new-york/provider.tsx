"use client"

// 中文：Provider registry 条目把 React runtime 和常用 hooks 统一转发给 shadcn 项目。
// English: The provider registry entry forwards the React runtime and common hooks into shadcn projects.
export {
  MultimodalProvider,
  useInteractionAssistant,
  useInteractionActions,
  useInteractionApi,
  useInteractionHint,
  useInteractionManifest,
  useInteractionObject,
  useInteractionObjects,
  useInteractionRoutes,
  useLastResolution,
  useInteractionSnapshot,
  useSubmitUtterance,
  type InteractionAssistantApi,
  type InteractionApi,
  type InteractionHint,
  type InteractionSubmitResult,
  type AppInteractionManifest,
  type UseInteractionAssistantOptions,
  type UseInteractionRoutesOptions,
} from "@multimodal-ui/react"
import "@multimodal-ui/react/styles.css"
