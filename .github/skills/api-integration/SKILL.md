---
name: api-integration
user-invocable: true
description: "Workspace skill for designing, implementing, reviewing, and testing API integrations across backend routes, third-party services, and frontend API calls."
---

# API Integration Skill

## Use when

- building or updating backend API endpoints in `backend/src/routes`
- integrating third-party providers such as payments, SMS, or webhooks
- connecting frontend actions to backend API routes in `frontend/src`
- validating request/response contracts, auth flows, and error handling
- reviewing API design, service abstractions, or integration tests

## Workflow

1. Understand the goal
   - determine the endpoint purpose, HTTP method, payload shape, and expected responses
   - identify required auth, permissions, and whether the integration is internal or external
   - verify which existing route, service, Prisma model, or frontend page is involved

2. Map the code path
   - find the backend route and its service layer in `backend/src/routes` and `backend/src/services`
   - inspect related Prisma models in `backend/prisma/schema.prisma` if database state is involved
   - inspect frontend API callers, hooks, or pages in `frontend/src` for UI integration

3. Implement or update behavior
   - add validation for request body/query parameters and return clear HTTP status codes
   - keep secrets in environment variables; do not hardcode API keys or tokens
   - use existing helper modules and consistent error-handling patterns
   - keep external API integrations isolated behind service wrappers

4. Verify and test
   - confirm the endpoint works with realistic payloads and auth headers
   - check that frontend components handle success, error, and loading states correctly
   - add or update tests where appropriate and ensure behavior matches the API contract

5. Document and clean up
   - update README or comments when the integration changes public-facing behavior
   - ensure error messages are actionable and user-friendly
   - remove any dead code or duplicate logic introduced by the change

## Quality criteria

- HTTP method, route, validation, and status codes are appropriate
- sensitive data is stored securely in environment variables
- errors are handled consistently and do not leak internal details
- frontend and backend contract shapes match
- new or modified integration logic is covered by tests or manual verification

## Example prompts

- "Create a new POST `/payouts` endpoint that validates input and calls the payout service."
- "Connect the frontend savings page to the backend savings API and handle success/error feedback."
- "Review the existing payment integration for auth, retry, and error-handling issues."
- "Write a test for the backend transaction route that covers invalid request data."
