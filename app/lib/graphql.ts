// ─────────────────────────────────────────────────────────────────────────────
// GraphQL API Configuration & Fixed Constants
// ─────────────────────────────────────────────────────────────────────────────

export const GRAPHQL_ENDPOINT = "https://api-dev.nuoro.life/graphql";

// Fixed values sent as HTTP request headers on every call
export const DEVICE_ID = "499AE2D8-71B4-46B1-BFFF-5134D2E1391C";
export const CVALUE = "1.0.2";
export const CONTENT_TYPE_HEADER = "application/json";

// ─────────────────────────────────────────────────────────────────────────────
// Queries & Mutations
// ─────────────────────────────────────────────────────────────────────────────

export const AUTH_VERIFY_MUTATION = `
  mutation AuthVerify($input: AuthVerifyInput!) {
    AuthVerify(AuthVerifyInput: $input) {
      accessToken
      refreshToken
      user {
        id
        firstName
        lastName
        phone
        email
        address
      }
    }
  }
`;

export const AUTH_TOKEN_REFRESH_MUTATION = `
  mutation AuthTokenRefresh($refreshToken: String!) {
    AuthTokenRefresh(refreshToken: $refreshToken) {
      accessToken
      refreshToken
    }
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// Reusable fetch helper
// ─────────────────────────────────────────────────────────────────────────────

interface GraphQLResponse<T> {
	data?: T;
	errors?: { message: string }[];
}

export async function gqlFetch<T>(
	query: string,
	variables?: Record<string, unknown>,
	accessToken?: string | null,
): Promise<GraphQLResponse<T>> {
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		"nw-did": DEVICE_ID, // Device ID header required by the API
		"nw-cv": CVALUE, // Client version header required by the API
	};

	if (accessToken) {
		headers["Authorization"] = `Bearer ${accessToken}`;
	}

	const res = await fetch(GRAPHQL_ENDPOINT, {
		method: "POST",
		headers,
		body: JSON.stringify({ query, variables }),
	});

	if (!res.ok) {
		throw new Error(`HTTP ${res.status}: ${res.statusText}`);
	}

	return res.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// Response Types
// ─────────────────────────────────────────────────────────────────────────────

export interface AuthVerifyPayload {
	AuthVerify: {
		accessToken: string;
		refreshToken: string;
		user: {
			id: string;
			firstName: string;
			lastName: string;
			phone: string;
			email: string;
			address: string;
		};
	};
}

export interface AuthTokenRefreshPayload {
	AuthTokenRefresh: {
		accessToken: string;
		refreshToken: string;
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// Typed Mutation Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Call on login — phone must already include the 8899 test prefix. */
export async function callAuthVerify(
	phone: string,
	countryCode: string,
	otp: string,
) {
	return gqlFetch<AuthVerifyPayload>(AUTH_VERIFY_MUTATION, {
		input: { phone, countryCode, otp }, // deviceId is sent as header nw-did
	});
}

/** Call when the access token has expired to get a fresh pair. */
export async function callAuthTokenRefresh(refreshToken: string) {
	return gqlFetch<AuthTokenRefreshPayload>(AUTH_TOKEN_REFRESH_MUTATION, {
		refreshToken,
	});
}
