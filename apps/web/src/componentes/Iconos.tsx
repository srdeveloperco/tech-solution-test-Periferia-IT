import type { SVGProps } from "react"

type Props = SVGProps<SVGSVGElement> & { tam?: number }

function Base({ tam = 16, children, ...resto }: Props) {
  return (
    <svg
      width={tam}
      height={tam}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...resto}
    >
      {children}
    </svg>
  )
}

export const IconoCheck = (p: Props) => (
  <Base {...p}>
    <path d="M3.5 8.5l3 3 6-7" />
  </Base>
)

export const IconoAlerta = (p: Props) => (
  <Base {...p}>
    <path d="M8 4.5v4.25M8 11.25v.01" />
    <circle cx="8" cy="8" r="6.25" />
  </Base>
)

export const IconoBloqueo = (p: Props) => (
  <Base {...p}>
    <circle cx="8" cy="8" r="6.25" />
    <path d="M3.6 12.4l8.8-8.8" />
  </Base>
)

export const IconoPausa = (p: Props) => (
  <Base {...p}>
    <circle cx="8" cy="8" r="6.25" />
    <path d="M6.5 5.75v4.5M9.5 5.75v4.5" />
  </Base>
)

export const IconoGuion = (p: Props) => (
  <Base {...p}>
    <path d="M5 8h6" />
  </Base>
)

export const IconoCirculo = (p: Props) => (
  <Base {...p}>
    <circle cx="8" cy="8" r="5.5" />
  </Base>
)

export const IconoGiro = (p: Props) => (
  <Base className="girando" {...p}>
    <path d="M8 2.25a5.75 5.75 0 1 1-5.75 5.75" />
  </Base>
)

export const IconoEnviar = (p: Props) => (
  <Base {...p}>
    <path d="M8 13V3.5M3.75 7.5L8 3.25l4.25 4.25" />
  </Base>
)

export const IconoChevron = (p: Props) => (
  <Base {...p}>
    <path d="M6 4l4 4-4 4" />
  </Base>
)

export const IconoAtras = (p: Props) => (
  <Base {...p}>
    <path d="M10 4L6 8l4 4" />
  </Base>
)

export const IconoDescarga = (p: Props) => (
  <Base {...p}>
    <path d="M8 2.75v7.5M4.75 7.25L8 10.5l3.25-3.25M3 13.25h10" />
  </Base>
)

export const IconoDocumento = (p: Props) => (
  <Base {...p}>
    <path d="M4 1.75h5.25L12.5 5v9.25H4z" />
    <path d="M9 1.75V5.25h3.5" />
  </Base>
)

export const IconoBandeja = (p: Props) => (
  <Base {...p}>
    <path d="M2.25 9.25l1.5-6h8.5l1.5 6v3.5H2.25z" />
    <path d="M2.25 9.25h3.25l.75 1.5h3.5l.75-1.5h3.25" />
  </Base>
)

export const IconoPulso = (p: Props) => (
  <Base {...p}>
    <path d="M1.75 8h2.5l1.5-4 2.5 8 1.5-4h4.5" />
  </Base>
)

export const IconoSalir = (p: Props) => (
  <Base {...p}>
    <path d="M6.25 2.75h-3.5v10.5h3.5M10.5 5L13.5 8l-3 3M13.25 8H6.5" />
  </Base>
)

export const IconoNuevo = (p: Props) => (
  <Base {...p}>
    <path d="M8 3.25v9.5M3.25 8h9.5" />
  </Base>
)

export const IconoEscudo = (p: Props) => (
  <Base {...p}>
    <path d="M8 1.75l5 1.75v4c0 3.25-2.25 5.5-5 6.75-2.75-1.25-5-3.5-5-6.75v-4z" />
    <path d="M5.75 8l1.5 1.5 3-3" />
  </Base>
)

export const IconoReloj = (p: Props) => (
  <Base {...p}>
    <circle cx="8" cy="8" r="6.25" />
    <path d="M8 4.75V8l2.25 1.5" />
  </Base>
)
