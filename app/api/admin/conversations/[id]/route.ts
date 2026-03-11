import { db } from "@/lib/db";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { NextRequest } from "next/server";

const client = new ElevenLabsClient({
	apiKey: process.env.ELEVENLABS_API_KEY!,
});

export async function GET(
	_request: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	try {
		const { id } = await params;
		const detail = await client.conversationalAi.conversations.get(id);

		const elevenLabsTranscript = (detail.transcript ?? [])
			.filter(
				(t: any) =>
					(t.role === "agent" || t.role === "user") && t.message?.trim(),
			)
			.map((t: any) => ({
				role: t.role === "agent" ? "assistant" : "user",
				message: t.message,
				time_in_call_secs: t.timeInCallSecs ?? 0,
			}));

		let dbMessages: any[] = [];
		try {
			const res = await db.query(
				"SELECT sender, text, sent_at FROM admin_messages WHERE conversation_id = $1 ORDER BY sent_at ASC",
				[id]
			);
			dbMessages = res.rows;
		} catch (e) {
			console.error("Failed to fetch admin_messages", e);
		}

		const startTimeSecs = detail.metadata?.startTimeUnixSecs ?? Math.floor(Date.now() / 1000);

		const mergedTranscript = [
			...elevenLabsTranscript,
			...dbMessages.map((msg) => {
				const sentSecs = Math.floor(new Date(msg.sent_at).getTime() / 1000);
				return {
					role: msg.sender === "patient" ? "user" : "assistant",
					message: msg.text,
					time_in_call_secs: Math.max(0, sentSecs - startTimeSecs),
					isHuman: msg.sender !== "patient",
					sender: msg.sender,
				};
			})
		].sort((a, b) => a.time_in_call_secs - b.time_in_call_secs);

		return Response.json({
			conversation_id: detail.conversationId,
			status: detail.status,
			start_time: detail.metadata?.startTimeUnixSecs,
			duration_secs: detail.metadata?.callDurationSecs ?? 0,
			user_name:
				(detail as any).conversationInitiationClientData?.dynamicVariables
					?.user_name ?? "Unknown",
			user_id:
				(detail as any).conversationInitiationClientData?.dynamicVariables
					?.user_id ?? null,
			user_phone:
				(detail as any).conversationInitiationClientData?.dynamicVariables
					?.user_phone ?? null,
			transcript_summary: (detail as any).analysis?.transcriptSummary ?? null,
			summary_title: (detail as any).analysis?.callSummaryTitle ?? null,
			call_successful: (detail as any).analysis?.callSuccessful ?? null,
			transcript: mergedTranscript,
		});
	} catch (err: any) {
		console.error("[admin/conversations/id] error:", err?.message);
		return Response.json({ error: "Failed to fetch conversation" }, { status: 500 });
	}
}
