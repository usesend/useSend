# 🤝 Contributing to useSend

Thanks for your interest in contributing to **useSend**! We’re an open-source email infrastructure platform, and we’d love your help to make it even better. This guide will walk you through how to get started, set up the project locally, and submit contributions.

---

## 🧰 Getting Started

All contributions begin with setting up the project locally. Follow the steps below to get started.

📖 **Refer to the full setup guide:**  
[https://docs.usesend.com/get-started/local](https://docs.usesend.com/get-started/local)

### ⚙️ Prerequisites

You’ll need:

- A GitHub account
- Node.js v18+
- `pnpm` (use `corepack enable` to activate)
- Docker (recommended)
- AWS & Cloudflare accounts (free tiers are fine)

---

## 🛠 Setting Up the Project

### 1. Fork & Clone

```bash
git clone https://github.com/YOUR-USERNAME/usesend.git
cd usesend
```

### 2. Install Dependencies

```bash
corepack enable
pnpm install
```

### 3. Setup Environment Variables

```bash
cp .env.example .env
```

Then:

- Generate a secret:

```bash
openssl rand -base64 32
```

- Add this to `.env` as `NEXTAUTH_SECRET`.

### 4. GitHub OAuth (Optional for Dev)

Set up a GitHub OAuth App:

- Homepage: `http://localhost:3000/login`
- Callback: `http://localhost:3000/api/auth/callback/github`

Add credentials to `.env`:

```env
GITHUB_ID=your_client_id
GITHUB_SECRET=your_client_secret
```

### 5. AWS Credentials (Optional for local email)

If you want to send real emails, add:

```env
AWS_ACCESS_KEY=your_access_key
AWS_SECRET_KEY=your_secret_key
```

> You can skip this by using the `local-sen-sns` image for local-only email development.

---

## 🚀 Running the App

### Option 1: Docker (Recommended)

```bash
pnpm d
```

- **Dashboard**: [http://localhost:3000](http://localhost:3000)
- **Marketing Site**: [http://localhost:3001](http://localhost:3001)

> To test GitHub login, run:

```bash
cloudflared tunnel --url http://localhost:3000
```

Paste the Cloudflare URL in your GitHub App callback settings.

---

### Option 2: Manual DB Setup

If you're using your own PostgreSQL & Redis:

1. Add in `.env`:

```env
DATABASE_URL=your_postgres_url
REDIS_URL=your_redis_url
```

2. Migrate database:

```bash
pnpm db:migrate-dev
```

3. Start dev server:

```bash
pnpm dev
```

4. Use `cloudflared` as mentioned above if needed.

---

### 📝 Run Documentation Locally

```bash
pnpm dev:docs
```

---

## 📂 Code Structure Overview

```
apps/
├── web          # Dashboard & Email Infra
├── marketing    # Landing page
├── docs         # This documentation site

packages/
├── eslint-config     # Shared ESLint rules
├── sdk               # TypeScript SDK for useSend REST API
├── tailwind-config   # Shared Tailwind setup
├── typescript-config # Shared tsconfig
├── ui                # Shared UI components (buttons, modals, etc.)
```

---

## 🧑‍💻 Making Contributions

1. **Create a Feature Branch**

```bash
git checkout -b feat/your-feature
```

2. **Make Your Changes**

   - Follow the existing project structure.
   - Write clean, modular, and reusable code.
   - Formatting is enforced with Prettier.

3. **Commit Your Work**

```bash
git add .
git commit -m "feat: your message here"
```

4. **Push and Open a Pull Request**

```bash
git push origin feat/your-feature
```

- Open a PR against the `main` branch
- Fill in the PR template

---

## 💬 Community and Support

- **Discord**: [Join our server](https://discord.gg/BU8n8pJv8S)
- **GitHub Discussions**: [Start a discussion](https://github.com/usesend/usesend/discussions)
- **GitHub Issues**: [Report issues or bugs](https://github.com/usesend/usesend/issues)

---

## 🙋 Questions?

Need help or unsure where to begin? Just ask!

- Chat with us on [Discord](https://discord.gg/BU8n8pJv8S)
- Open an [Issue](https://github.com/usesend/usesend/issues)

We’re excited to see your ideas and contributions! 💌
