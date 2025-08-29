## Description

Pure Flow is a benchmark application that uses modern technologies and implements a set of common security vulnerabilities.

The application contains:

- React based web client & API: http://localhost:3000
- Node.js server that serves the React client and provides both OpenAPI and GraphQL endpoints.
  The full API documentation is available via swagger or GraphQL:
  - Swagger UI - http://localhost:3000/swagger
  - Swagger JSON file - http://localhost:3000/swagger-json
  - GraphiQL UI - http://localhost:3000/graphiql

> **Note**
> The GraphQL API does not yet support all the endpoints the REST API does.

## Building and Running the Application

Build and start local development environment with Postgres DB, MailCatcher and the app:

```bash
docker compose --file=compose.local.yml up -d
```

To rebuild the app and restart the containers:

```bash
docker compose --file=compose.local.yml up -d --build --force-recreate
```
