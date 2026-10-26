import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App"
import "./estilos/tokens.css"
import "./estilos/base.css"
import "./estilos/espacio.css"
import "./estilos/chat.css"
import "./estilos/lienzo.css"
import "./estilos/observatorio.css"
import "./estilos/login.css"

const raiz = document.getElementById("raiz")
if (raiz) {
  createRoot(raiz).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
