import {
	AuthTokenRefreshPayload,
	AuthVerifyPayload,
	GraphQLResponse,
} from "@/types";

export const GRAPHQL_ENDPOINT = "https://api-dev.nuoro.life/graphql";

export const DEVICE_ID = "499AE2D8-71B4-46B1-BFFF-5134D2E1391C";
export const CVALUE = "1.0.2";
export const CONTENT_TYPE_HEADER = "application/json";

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

export async function gqlFetch<T>(
	query: string,
	variables?: Record<string, unknown>,
	accessToken?: string | null,
): Promise<GraphQLResponse<T>> {
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		"nw-did": DEVICE_ID,
		"nw-cv": CVALUE,
	};

	if (accessToken) {
		headers["Authorization"] = accessToken;
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

export async function callAuthVerify(
	phone: string,
	countryCode: string,
	otp: string,
) {
	return gqlFetch<AuthVerifyPayload>(AUTH_VERIFY_MUTATION, {
		input: { phone, countryCode, otp },
	});
}

export async function callAuthTokenRefresh(refreshToken: string) {
	return gqlFetch<AuthTokenRefreshPayload>(AUTH_TOKEN_REFRESH_MUTATION, {
		refreshToken,
	});
}
