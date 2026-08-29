import { describe, expect, it } from 'vitest'
import { simpleParser } from 'mailparser'
import { resolveRecipients } from './recipients'

async function parse(lines: string[]) {
  return simpleParser(lines.join('\r\n'))
}

describe('resolveRecipients', () => {
  it('derives bcc from envelope recipients missing from To and Cc', async () => {
    const parsed = await parse([
      'From: sender@example.com',
      'To: "Recipient One" <recipient@example.com>',
      'Cc: copy@example.com',
      'Subject: Invoice',
      '',
      'Hello',
    ])

    const result = resolveRecipients(parsed, [
      'recipient@example.com',
      'copy@example.com',
      'hidden@example.com',
    ])

    expect(result).toEqual({
      to: '"Recipient One" <recipient@example.com>',
      cc: 'copy@example.com',
      bcc: 'hidden@example.com',
    })
  })

  it('compares addresses case-insensitively', async () => {
    const parsed = await parse([
      'From: sender@example.com',
      'To: Recipient@Example.com',
      'Subject: Invoice',
      '',
      'Hello',
    ])

    const result = resolveRecipients(parsed, ['recipient@example.com'])

    expect(result).toEqual({
      to: 'Recipient@Example.com',
      cc: undefined,
      bcc: undefined,
    })
  })

  it('merges a leaked Bcc header with envelope-only recipients', async () => {
    const parsed = await parse([
      'From: sender@example.com',
      'To: recipient@example.com',
      'Bcc: header-hidden@example.com',
      'Subject: Invoice',
      '',
      'Hello',
    ])

    const result = resolveRecipients(parsed, [
      'recipient@example.com',
      'header-hidden@example.com',
      'envelope-hidden@example.com',
    ])

    expect(result.bcc).toBe(
      'header-hidden@example.com, envelope-hidden@example.com'
    )
  })

  it('keeps the header Bcc when the envelope is unavailable', async () => {
    const parsed = await parse([
      'From: sender@example.com',
      'To: recipient@example.com',
      'Bcc: hidden@example.com',
      'Subject: Invoice',
      '',
      'Hello',
    ])

    expect(resolveRecipients(parsed, []).bcc).toBe('hidden@example.com')
  })

  it('returns undefined bcc when the envelope matches the headers', async () => {
    const parsed = await parse([
      'From: sender@example.com',
      'To: a@example.com, b@example.com',
      'Subject: Invoice',
      '',
      'Hello',
    ])

    const result = resolveRecipients(parsed, ['a@example.com', 'b@example.com'])

    expect(result).toEqual({
      to: 'a@example.com, b@example.com',
      cc: undefined,
      bcc: undefined,
    })
  })
})
