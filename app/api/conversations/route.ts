import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

const client = new ElevenLabsClient({
	apiKey: process.env.ELEVENLABS_API_KEY!,
});

export async function GET(request: Request) {
	try {
		const { searchParams } = new URL(request.url);
		const userId = searchParams.get("user_id");

		const result = await client.conversationalAi.conversations.list({
			agentId: process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID!,
			callSuccessful: "success",
			userId: userId ?? undefined,
			pageSize: 1,
			summaryMode: "include",
		});

		const latest = result.conversations[0];
		if (!latest) {
			return Response.json({ messages: [] });
		}

		const detail = await client.conversationalAi.conversations.get(
			latest.conversationId,
		);

		return Response.json({ messages: detail.transcript ?? [] });
	} catch (error) {
		console.error("Error fetching conversations:", error);
		return Response.json({ messages: [] }, { status: 500 });
	}
}
