export const SWAGGER_DESC_LOGIN_WITH_RSA_JWT_KEYS = `Authenticates user and returns JWT token with RSA256 protocol. The key is siigned with RSA private key.`;

export const SWAGGER_DESC_LOGIN_WITH_KID_SQL_JWT = `Authenticates user and returns JWT token with HCA256. The key id is provided in KID protocol.`;

export const SWAGGER_DESC_CALL_OIDC_CLIENT = `Get OIDC client configuration. Returns public OIDC. These keys are configurable via CLIENT_ID, CLIENT_SECRET env variables.`;

export const SWAGGER_DESC_VALIDATE_WITH_KID_SQL_JWT = `Validates the JWT header and returns secret if the header is valid. Executes SQL query by concatenating the KID value with the query.
    In case of None algorithm ignores the signature.`;

export const SWAGGER_DESC_LOGIN_WITH_WEAK_KEY_JWT = `Authenticates user and returns JWT token with HCA256. The key is configurable on server via the JWT_SECRET_KEY env variable.`;

export const SWAGGER_DESC_REQUEST_WITH_DOM_CSRF_TOKEN = `Authenticates user and returns DOM CSRF token.`;

export const SWAGGER_DESC_REQUEST_WITH_SIMPLE_CSRF_TOKEN = `Returns Simple CSRF token.`;

export const SWAGGER_DESC_VALIDATE_WITH_WEAK_KEY_JWT = `Validates the JWT header and return secret if the header is valid. The token validation is done using algorithm in header and key
    that is configured in JWT_SECRET_KEY env variable. In case of None algorithm ignores the signature.`;

export const SWAGGER_DESC_LOGIN_WITH_JKU_JWT = `Authenticates user and returns JWT token with HCA256. The key is configurable on server via the JWT_SECRET_KEY env variable.`;

export const SWAGGER_DESC_LOGIN_WITH_JWK_JWT = `Authenticates user and returns JWT token with HCA256. The key is configurable on server via JWT_SECRET_KEY env variable.`;

export const SWAGGER_DESC_VALIDATE_WITH_JWK_JWT = `Vulrenability case: JWK field JSON in Header has empty values and our private key to sign the JWT`;

export const SWAGGER_DESC_LOGIN_WITH_X5C_JWT = `Authenticates user and returns JWT token with HCA256. The key is configurable on server via the JWT_SECRET_KEY env variable.`;

export const SWAGGER_DESC_LOGIN_WITH_HMAC_JWT = `Authenticates user and returns JWT token with HS256. The key is configurable on server via the JWT_SECRET_KEY env variable.`;

export const SWAGGER_DESC_LOGIN_WITH_RSA_SIGNATURE_JWT = `Authenticates user and returns JWT token with RS256. The key is configurable on server via the JWT_SECRET_KEY env variable.`;

export const SWAGGER_DESC_LOGIN_WITH_X5U_JWT = `Authenticates user and returns JWT token with HCA256. The key is configurable on server via the JWT_SECRET_KEY env variable.`;
