import { NextResponse } from "next/server";

const AGENT_ID = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID!;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

export async function GET() {
	if (!AGENT_ID) {
		return NextResponse.json(
			{ error: "Agent ID not configured" },
			{ status: 500 },
		);
	}

	if (!ELEVENLABS_API_KEY) {
		// No API key — agent is public, client connects directly with agentId
		return NextResponse.json({ agentId: AGENT_ID, mode: "public" });
	}

	try {
		// For WebRTC + private agent: get a conversationToken
		const res = await fetch(
			`https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${AGENT_ID}`,
			{
				headers: {
					"xi-api-key": ELEVENLABS_API_KEY,
				},
			},
		);

		if (res.ok) {
			const data = await res.json();
			if (data.token) {
				return NextResponse.json({
					conversationToken: data.token,
					mode: "private-webrtc",
				});
			}
		}

		// Try signed URL fallback (for websocket mode)
		const res2 = await fetch(
			`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${AGENT_ID}`,
			{
				headers: {
					"xi-api-key": ELEVENLABS_API_KEY,
				},
			},
		);

		if (res2.ok) {
			const data2 = await res2.json();
			if (data2.signed_url) {
				return NextResponse.json({
					signedUrl: data2.signed_url,
					mode: "private-websocket",
				});
			}
		}

		console.warn(
			"[ElevenLabs token] Both token endpoints failed, falling back to public.",
		);
		return NextResponse.json({ agentId: AGENT_ID, mode: "public" });
	} catch (error) {
		console.error("[ElevenLabs token] Network error:", error);
		return NextResponse.json({ agentId: AGENT_ID, mode: "public" });
	}
}
