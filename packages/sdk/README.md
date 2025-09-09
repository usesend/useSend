# useSend SDK

## Prerequisites

- [useSend API key](https://app.usesend.com/dev-settings/api-keys)
- [Verified domain](https://app.usesend.com/domains)

## Installation

### NPM

```bash
npm install usesend
```

### Yarn

```bash
yarn add usesend
```

### PNPM

```bash
pnpm add usesend
```

### Bun

```bash
bun add usesend
```

## Usage

```javascript
import { UseSend } from "usesend";

const usesend = new UseSend("us_12345");

// for self-hosted installations you can pass your base URL
// const usesend = new UseSend("us_12345", "https://app.usesend.com");

usesend.emails.send({
  to: "hello@acme.com",
  from: "hello@company.com",
  subject: "useSend email",
  html: "<p>useSend is the best open source product to send emails</p>",
  text: "useSend is the best open source product to send emails",
});
```
