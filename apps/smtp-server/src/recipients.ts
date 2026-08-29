import type { AddressObject, ParsedMail } from 'mailparser'

type RecipientField = AddressObject | AddressObject[] | undefined

function toList(field: RecipientField): AddressObject[] {
  if (!field) return []
  return Array.isArray(field) ? field : [field]
}

function fieldText(field: RecipientField): string | undefined {
  const list = toList(field)
  return list.length > 0 ? list.map((addr) => addr.text).join(', ') : undefined
}

function fieldAddresses(field: RecipientField): string[] {
  return toList(field).flatMap((addr) =>
    addr.value.flatMap((entry) => {
      if (entry.address) return [entry.address]
      // Address groups keep their members nested one level deeper.
      return (entry.group ?? [])
        .map((member) => member.address)
        .filter((address): address is string => Boolean(address))
    })
  )
}

function normalize(address: string): string {
  return address.trim().toLowerCase()
}

/**
 * Resolves the To/Cc/Bcc fields for the useSend API from a parsed message and
 * the SMTP envelope.
 *
 * RFC 5322 tells sending clients to strip the `Bcc:` header before
 * transmission, so for a compliant client the Bcc recipients only survive in
 * the SMTP envelope (`RCPT TO`). Every envelope recipient that is not already
 * named in To or Cc is therefore treated as Bcc. A leaked `Bcc:` header is
 * still honored so non-compliant clients keep working.
 */
export function resolveRecipients(
  parsed: ParsedMail,
  envelopeRecipients: string[]
): { to?: string; cc?: string; bcc?: string } {
  const to = fieldText(parsed.to)
  const cc = fieldText(parsed.cc)

  const visible = new Set(
    [...fieldAddresses(parsed.to), ...fieldAddresses(parsed.cc)].map(normalize)
  )

  const bcc: string[] = []
  const seen = new Set<string>()
  const addBcc = (address: string) => {
    const key = normalize(address)
    if (visible.has(key) || seen.has(key)) return
    seen.add(key)
    bcc.push(address)
  }

  fieldAddresses(parsed.bcc).forEach(addBcc)
  envelopeRecipients.forEach(addBcc)

  return { to, cc, bcc: bcc.length > 0 ? bcc.join(', ') : undefined }
}
