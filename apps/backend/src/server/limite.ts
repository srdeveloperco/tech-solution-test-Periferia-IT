/** Límite simple de peticiones por IP (ventana deslizante en memoria). Protege la clave del modelo. */
export class LimitePorIp {
  private readonly marcas = new Map<string, number[]>()

  constructor(
    private readonly maximo: number,
    private readonly ventanaMs: number,
  ) {}

  permitir(ip: string): boolean {
    const ahora = Date.now()
    const recientes = (this.marcas.get(ip) ?? []).filter((t) => ahora - t < this.ventanaMs)
    if (recientes.length >= this.maximo) {
      this.marcas.set(ip, recientes)
      return false
    }
    recientes.push(ahora)
    this.marcas.set(ip, recientes)
    if (this.marcas.size > 5000) this.purgar(ahora)
    return true
  }

  private purgar(ahora: number): void {
    for (const [ip, marcas] of this.marcas) {
      if (marcas.every((t) => ahora - t >= this.ventanaMs)) this.marcas.delete(ip)
    }
  }
}
