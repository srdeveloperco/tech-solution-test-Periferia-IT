import DOMPurify from "dompurify"
import { marked } from "marked"
import { memo, useMemo } from "react"

marked.setOptions({ gfm: true, breaks: true })

/** Markdown del agente, saneado antes de insertarlo. */
export const Markdown = memo(function Markdown({ texto }: { texto: string }) {
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(texto, { async: false })), [texto])
  // biome-ignore lint/security/noDangerouslySetInnerHtml: HTML saneado con DOMPurify
  return <div className="markdown" dangerouslySetInnerHTML={{ __html: html }} />
})
