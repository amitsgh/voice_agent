import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";

const client = new ElevenLabsClient({
	apiKey: process.env.ELEVENLABS_API_KEY!,
});

const AGENT_ID = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID!;

export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const status = searchParams.get("status") ?? "all"; // "in-progress" | "done" | "all"
		const pageSize = parseInt(searchParams.get("page_size") ?? "20", 10);

		const params: any = {
			agentId: AGENT_ID,
			pageSize,
		};
		// ElevenLabs accepts "in-progress" | "done" | "processing"
		if (status !== "all") params.callSuccess = undefined; // don't filter by success for admin

		const result = await client.conversationalAi.conversations.list(params);
		const conversations = result.conversations ?? [];

		// Filter by status on our side when status param is set
		const filtered =
			status === "all"
				? conversations
				: conversations.filter((c) => c.status === status);

		// Fetch all active takeovers to decorate the list
		const takeoverResult = await db.query(
			"SELECT conversation_id FROM admin_takeovers WHERE is_active = true"
		);
		const activeTakeovers = new Set(takeoverResult.rows.map((r: any) => r.conversation_id));

		const items = filtered.map((c) => ({
			conversation_id: c.conversationId,
			status: c.status,
			agent_id: c.agentId,
			start_time: c.startTimeUnixSecs,
			duration_secs: c.callDurationSecs ?? 0,
			// user_name lives in dynamicVariables which requires a detail fetch — omit for list
			transcript_summary: (c as any).transcriptSummary ?? null,
			is_takeover: activeTakeovers.has(c.conversationId),
		}));

		return Response.json({ conversations: items });
	} catch (err: any) {
		console.error("[admin/conversations] list error:", err?.message);
		return Response.json({ conversations: [] }, { status: 500 });
	}
}
