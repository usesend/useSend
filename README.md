<p align="center">
  <img style="width: 200px;height: 200px; margin: auto;" src="https://usesend.com/logo-squircle.png" alt="useSend Logo">
</p>

<p align="center" style="margin-top: 20px">
  <p align="center">
  The Open Source sending infrastructure.
  <br>
    <a href="https://usesend.com"><strong>Learn more »</strong></a>
    <br />
    <br />
    <a href="https://discord.gg/BU8n8pJv8S">Discord</a>
    .
    <a href="https://usesend.com">Website</a>
    ·
    <a href="https://github.com/usesend/usesend/issues">Issues</a>
  </p>
</p>

<p align="center">
   <a href="https://discord.gg/BU8n8pJv8S"><img src="https://img.shields.io/badge/Discord-usesend-%235865F2" alt="Join useSend on Discord"></a>
   <a href="https://github.com/usesend/usesend/stargazers"><img src="https://img.shields.io/github/stars/usesend%2Fusesend" alt="GitHub Stars"></a>
   <a href="https://github.com/usesend/usesend/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-AGPLv3-purple" alt="License"></a>
   <a href="https://hub.docker.com/r/usesend/usesend"><img alt="Docker Automated build" src="https://img.shields.io/docker/pulls/usesend/usesend"></a>
</p>

## About this project

As most of email products out there, useSend also uses Amazon SES under the hood to send emails. We provide an open and alternative way to send emails reliably and cheaply with a great dashboard. You can also use useSend manage contacts and send bulk emails(newsletter, product updates etc). We will take care of the subscriptions.

Currently we only support emails, but we plan to expand to other sending protocols like SMS, push notification and even whatsapp.

We are currently in beta and trying to rollout to public slowly. If you're interested [join our waitlist](https://app.youform.io/forms/caja89vr) or drop in a message in discord.

## Features

- [x] Add domains
- [x] Transactional Mails
- [x] Rest API
- [x] Dashboard (Delivered, opened, clicked, bounced)
- [x] Marketing email
- [x] SMTP support
- [x] Schedule API
- [ ] Webhook support
- [ ] BYO AWS credentials

## Community and Next Steps 🎯

We're currently working on opening useSend for public beta.

- Check out the first source code release in this repository and test it.
- Tell us what you think in the [Discussions](https://github.com/usesend/usesend/discussions).
- Join the [Discord server](https://discord.gg/BU8n8pJv8S) for any questions and getting to know to other community members.
- ⭐ the repository to help us raise awareness.
- Spread the word on Twitter.
- Fix or create [issues](https://github.com/usesend/usesend/issues), that are needed for the first production release.

## Tech Stack

- [Next.js](https://nextjs.org/) - Framework
- [Prisma](https://www.prisma.io/) - ORM
- [Tailwind](https://tailwindcss.com/) - CSS
- [shadcn/ui](https://ui.shadcn.com/) - Component Library
- [NextAuth.js](https://next-auth.js.org/) - Authentication
- [tRPC](https://trpc.io/) - API
- [hono](https://hono.dev/) - Public API
- [Redis](https://redis.io/) - Queue

### Email editor

Check out the editor code for [here](https://github.com/usesend/usesend/tree/main/packages/email-editor). Editor is possible only because of the amazing tools and libraries.

- [jsx-email](https://jsx.email/) - converts editor content to html
- [maily.to](https://maily.to/) - useSend email editor is greatly inspired from maily.to
- [tiptap](https://tiptap.dev/) - editor core

## Local Development

Follow our detailed guide to run useSend locally

[https://usesend.com/docs/get-started/local](https://usesend.com/docs/get-started/local)

## Docker

We provide a Docker container for useSend, which is published on both DockerHub and GitHub Container Registry.

DockerHub: [https://hub.docker.com/r/usesend/usesend](https://hub.docker.com/r/usesend/usesend)

GitHub Container Registry: [https://ghcr.io/usesend/usesend](https://ghcr.io/usesend/usesend)

You can pull the Docker image from either of these registries and run it with your preferred container hosting provider.

Please note that you will need to provide environment variables for connecting to the database, redis, aws and so forth.

For detailed instructions on how to configure and run the Docker container, please refer to the Docker [Docker README](./docker/README.md) in the docker directory.

## Self Hosting

Checkout the [Self hosting](https://docs.usesend.com/get-started/self-hosting) guide to learn how to self-host useSend.

Also

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/QbMnwX?referralCode=oaAwvp)

## Star History

<a href="https://star-history.com/#usesend/usesend&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=usesend/usesend&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=usesend/usesend&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=usesend/usesend&type=Date" />
 </picture>
</a>

## Sponsors

We are grateful for the support of our sponsors.

### Our Sponsors

<a href="https://doras.to/" target="_blank">
  <img src="https://cdn.doras.to/doras/assets/05c5db48-cfba-49d7-82a1-5b4a3751aa40/49ca4647-65ed-412e-95c6-c475633d62af.png" alt="doras.to" style="width:60px;height:60px;">
</a>
