import * as React from "react"
import { createRoot } from "react-dom/client"
import "@omni-ui/react/styles"
import { App } from "./App"

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
