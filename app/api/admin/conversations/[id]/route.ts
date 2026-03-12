// GET /api/admin/conversations/[id]
// Returns full conversation detail with a merged transcript:
//   1. Live AI + patient messages (source='ai'|'patient') from admin_messages
//   2. Human agent messages (source='human') from admin_messages
//   3. ElevenLabs post-call transcript (for completed sessions)
//
// During an in-progress session the ElevenLabs transcript is empty — we use the
// real-time rows written by /api/conversations/message instead.
// After the session ends the ElevenLabs transcript is authoritative for AI/patient
// turns; we keep the DB-only human agent rows on top.

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

		const startTimeSecs =
			detail.metadata?.startTimeUnixSecs ?? Math.floor(Date.now() / 1000);

		// ── 1. ElevenLabs transcript (only populated after session ends) ────
		const elevenLabsTranscript = (detail.transcript ?? [])
			.filter(
				(t: any) =>
					(t.role === "agent" || t.role === "user") &&
					t.message?.trim(),
			)
			.map((t: any) => ({
				role: t.role === "agent" ? "assistant" : "user",
				message: t.message,
				time_in_call_secs: t.timeInCallSecs ?? 0,
				isHuman: false,
				source: "elevenlabs",
			}));

		const isLive = detail.status === "in-progress";

		// ── 2. All messages from admin_messages table ────────────────────────
		let dbMessages: any[] = [];
		try {
			const res = await db.query(
				`SELECT id, sender, text, sent_at, source
         FROM admin_messages
         WHERE conversation_id = $1
         ORDER BY sent_at ASC`,
				[id],
			);
			dbMessages = res.rows;
		} catch (e) {
			console.error("Failed to fetch admin_messages:", e);
		}

		// Split: live transcript rows (ai/patient) vs human agent (human/legacy)
		const liveDbMessages = dbMessages.filter(
			(m) => m.source === "ai" || m.source === "patient",
		);
		const humanAgentMessages = dbMessages.filter(
			(m) =>
				m.source === "human" ||
				(!m.source &&
					m.sender !== "patient" &&
					m.sender !== "assistant"),
		);

		// ── 3. Build merged transcript ───────────────────────────────────────
		// Merge ElevenLabs transcript with all DB messages (including live AI/patient and human)
		// We use time_in_call_secs found from EightElevenLabs or calculated from DB sent_at.
		
		const mergedMessagesMap = new Map<string, any>();

		// Add ElevenLabs messages first
		elevenLabsTranscript.forEach((m: any) => {
			// Create a key based on role and content to deduplicate
			const key = `${m.role}:${m.message.trim()}`;
			mergedMessagesMap.set(key, m);
		});

		// Add DB messages (overwriting or adding new turns)
		dbMessages.forEach((msg) => {
			const role = (msg.sender === "patient") ? "user" : "assistant";
			const isHuman = (msg.source === "human" || (!msg.source && msg.sender !== "patient" && msg.sender !== "assistant"));
			
			const key = `${role}:${msg.text.trim()}`;
			
			// If already there from ElevenLabs, we keep EL one but maybe mark it human if needed
			// Actually, if it's in DB, it might have better metadata (isHuman, sender)
			if (!mergedMessagesMap.has(key) || isHuman) {
				mergedMessagesMap.set(key, {
					role,
					message: msg.text,
					time_in_call_secs: Math.max(
						0,
						Math.floor(new Date(msg.sent_at).getTime() / 1000) - startTimeSecs,
					),
					isHuman,
					sender: isHuman ? (msg.sender ?? "John") : undefined,
					source: msg.source || "db",
				});
			}
		});

		const mergedTranscript = Array.from(mergedMessagesMap.values()).sort(
			(a, b) => a.time_in_call_secs - b.time_in_call_secs,
		);

		return Response.json({
			conversation_id: detail.conversationId,
			status: detail.status,
			start_time: detail.metadata?.startTimeUnixSecs,
			duration_secs: detail.metadata?.callDurationSecs ?? 0,
			user_name:
				(detail as any).conversationInitiationClientData
					?.dynamicVariables?.user_name ?? "Unknown",
			user_id:
				(detail as any).conversationInitiationClientData
					?.dynamicVariables?.user_id ?? null,
			user_phone:
				(detail as any).conversationInitiationClientData
					?.dynamicVariables?.user_phone ?? null,
			transcript_summary:
				(detail as any).analysis?.transcriptSummary ?? null,
			summary_title: (detail as any).analysis?.callSummaryTitle ?? null,
			call_successful: (detail as any).analysis?.callSuccessful ?? null,
			transcript: mergedTranscript,
		});
	} catch (err: any) {
		console.error("[GET /api/admin/conversations/[id]] error:", err?.message);
		return Response.json(
			{ error: "Failed to fetch conversation" },
			{ status: 500 },
		);
	}
}
