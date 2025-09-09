# Docker Setup for useSend

The following guide will walk you through setting up useSend using Docker. You can choose between a production setup using Docker Compose or a standalone container.

## Prerequisites

Before you begin, ensure that you have the following installed:

- Docker
- Docker Compose (if using the Docker Compose setup)

## Option 1: Production Docker Compose Setup

This setup includes PostgreSQL, Redis and the useSend application.

1. Download the Docker Compose file from the useSend repository: [compose.yml](https://github.com/usesend/usesend/blob/main/docker/prod/compose.yml)
2. Navigate to the directory containing the `compose.yml` file.
3. Create a `.env` file in the same directory. Copy the contents of `.env.selfhost.example`
4. Run the following command to start the containers:

```
docker-compose --env-file ./.env up -d
```

This will start the PostgreSQL database, Redis and the useSend application containers.

5. Access the useSend application by visiting `http://localhost:3000` in your web browser.

## Option 2: Standalone Docker Container

If you prefer to host the useSend application on your container provider of choice, you can use the pre-built Docker image from DockerHub or GitHub's Package Registry. Note that you will need to provide your own database and SMTP host.

1. Pull the useSend Docker image:

```
docker pull usesend/usesend
```

Or, if using GitHub's Package Registry:

```
docker pull ghcr.io/usesend/usesend
```

2. Run the Docker container, providing the necessary environment variables for your database and SMTP host:

```
docker run -d \
  -p 3000:3000 \
  -e NEXTAUTH_URL="<your-nextauth-url>"
  -e NEXTAUTH_SECRET="<your-nextauth-secret>"
  -e DATABASE_URL="<your-next-private-database-url>"
  -e REDIS_URL="<your-next-private-redis-url>"
  -e AWS_ACCESS_KEY="<your-next-private-aws-access-key-id>"
  -e AWS_SECRET_KEY="<your-next-private-aws-secret-access-key>"
  -e AWS_DEFAULT_REGION="<your-next-private-aws-region>"
  -e GITHUB_ID="<your-next-private-github-id>"
  -e GITHUB_SECRET="<your-next-private-github-secret>"
  usesend/usesend
```

Replace the placeholders with your actual database and aws details.

1. Access the useSend application by visiting the URL you provided in the `NEXTAUTH_URL` environment variable in your web browser.

## Success

You have now successfully set up useSend using Docker. You can start sending emails efficiently. If you encounter any issues or have further questions, please refer to the official useSend documentation or seek assistance from the community.
