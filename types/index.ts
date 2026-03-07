export interface User {
	id: string;
	firstName: string;
	lastName: string;
	phone: string;
	email: string;
	address: string;
}

export interface AuthContextType {
	user: User | null;
	accessToken: string | null;
	isInitialized: boolean;
	requestOtp: (
		phone: string,
		countryCode: string,
	) => Promise<{ success: boolean; error?: string }>;
	verifyOtp: (
		phone: string,
		countryCode: string,
		otp: string,
	) => Promise<{ success: boolean; error?: string }>;
	logout: () => void;
}

export interface DynamicVariables {
	[key: string]: string | number | boolean;
	user_id: string;
	user_name: string;
	first_name: string;
	last_name: string;
	user_phone: string;
	access_token: string;
	device_id: string;
	cvalue: string;
	content_type: string;
	is_reconnect: boolean;
}

export interface ChatMessage {
	role: "user" | "assistant";
	content: string;
	time: string;
}

export interface AuthState {
	userId: string;
	firstName: string;
	lastName: string;
	phone: string;
	accessToken: string;
	refreshToken: string;
}

export interface GraphQLResponse<T> {
	data?: T;
	errors?: { message: string }[];
}

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
