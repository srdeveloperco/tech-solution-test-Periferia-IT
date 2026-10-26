import { IconoChevron } from "../Iconos"

const SUGERENCIAS = [
  { etiqueta: "Procesa la solicitud sol-001", mensaje: "Procesa la solicitud sol-001" },
  {
    etiqueta: "Revisa sol-004 sin crearla hasta que confirme",
    mensaje:
      'Procesa la solicitud "sol-004". Muéstrame la OC como quedaría en SAP, qué validaciones pasó y cuáles no, y no la crees hasta que yo lo confirme.',
  },
  {
    etiqueta: "¿Qué controles revisas antes de crear una OC?",
    mensaje: "¿Qué controles revisas antes de crear una OC?",
  },
]

export function Bienvenida({ onElegir }: { onElegir: (mensaje: string) => void }) {
  return (
    <div className="bienvenida">
      <h2>¿Qué solicitud revisamos?</h2>
      <p>
        Leo el paquete de una compra, lo valido contra los maestros y creo la orden en SAP. Si algo no cuadra, te
        pregunto antes de hacer nada.
      </p>
      <ul className="sugerencias">
        {SUGERENCIAS.map((s) => (
          <li key={s.etiqueta}>
            <button type="button" onClick={() => onElegir(s.mensaje)}>
              <span>{s.etiqueta}</span>
              <IconoChevron tam={14} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
