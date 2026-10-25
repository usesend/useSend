import { describe, expect, it } from "vitest";
import nodemailer from "nodemailer";
import addressparser from "nodemailer/lib/addressparser";
import { parseFromAddress } from "~/server/utils/from-address";

async function emittedFromAddress(from: { name: string; address: string }) {
  const { message } = await nodemailer
    .createTransport({ streamTransport: true })
    .sendMail({ from, to: "sink@example.test", text: "hi" });

  const chunks: Buffer[] = [];
  for await (const chunk of message) {
    chunks.push(chunk as Buffer);
  }
  const header = Buffer.concat(chunks)
    .toString()
    .match(/^From: (.*)$/m)?.[1];
  const [entry] = addressparser(header ?? "", { flatten: true });
  return entry?.address;
}

describe("parseFromAddress", () => {
  it.each([
    ["billing@b-corp.test", "", "billing@b-corp.test", "b-corp.test"],
    ["Name <a@b.com>", "Name", "a@b.com", "b.com"],
    ['"Last, First" <a@b.com>', "Last, First", "a@b.com", "b.com"],
    ["Acme, Inc <a@b.com>", "Acme, Inc", "a@b.com", "b.com"],
    [
      "Someone @ something <some@domain.com>",
      "Someone @ something",
      "some@domain.com",
      "domain.com",
    ],
    ["News <news@mail.b.com>", "News", "news@mail.b.com", "mail.b.com"],
    ["a@b.com (Acme)", "Acme", "a@b.com", "b.com"],
  ])("accepts %s", (from, name, address, domain) => {
    expect(parseFromAddress(from)).toEqual({ name, address, domain });
  });

  it.each([
    // The address hidden in a comment is dropped; the real mailbox wins.
    ["Billing (<x@b-corp.test>) <billing@a-corp.test>", "a-corp.test"],
    // A quoted display name may contain an angle-addr; the last one is real.
    ['"Me <x@b-corp.test>" <billing@a-corp.test>', "a-corp.test"],
    ["x@b-corp.test <billing@a-corp.test>", "a-corp.test"],
  ])("returns the delivered domain for %s", (from, domain) => {
    expect(parseFromAddress(from)?.domain).toBe(domain);
  });

  it.each([
    "billing@a-corp.test@b-corp.test",
    "<x@b-corp.test@a-corp.test>",
    "Group: billing@a-corp.test;",
    "Billing <x@b-corp.test>, billing@a-corp.test",
    "a@b.com, c@d.com",
    "@b.com",
    "a@",
    "foo",
    "",
  ])("rejects %s", (from) => {
    expect(parseFromAddress(from)).toBeUndefined();
  });

  it.each([
    "billing@b-corp.test",
    'Billing "<x@b-corp.test>" <billing@a-corp.test>',
    "Billing (<x@b-corp.test>) <billing@a-corp.test>",
    '"Me <x@b-corp.test>" <billing@a-corp.test>',
    "Someone @ something <some@domain.com>",
  ])("matches the address nodemailer emits for %s", async (from) => {
    const parsed = parseFromAddress(from);
    expect(parsed).toBeDefined();
    expect(await emittedFromAddress(parsed!)).toBe(parsed!.address);
  });
});
