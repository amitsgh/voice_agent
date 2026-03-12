"use client";

import { useConversation } from "@elevenlabs/react";
import { ArrowUpIcon, Mic, MicOff, PhoneIcon } from "lucide-react";
import * as React from "react";

import { LiveWaveform } from "@/components/ui/live-waveform";
import { cn } from "@/lib/utils";

// Max number of recent exchanges to inject on mode switch.
// Keeps the prompt from growing unboundedly on frequent switches.
const MAX_HISTORY_LINES = 40; // ~20 back-and-forth turns

export interface ConversationBarProps {
	agentId: string;
	userId: string;
	className?: string;
	waveformClassName?: string;
	isTakeover?: boolean;
	onConnect?: (conversationId?: string) => void;
	onDisconnect?: () => void;
	onError?: (error: Error) => void;
	onMessage?: (message: { source: "user" | "ai"; message: string }) => void;
	onSendMessage?: (message: string) => void;
	dynamicVariables?: Record<string, string | number | boolean>;
	overrides?: object;
	onHandover?: (reason: string) => void;
	/**
	 * When true, automatically start a text-only session.
	 * Pass historyLoaded (or equivalent) here so the session only starts
	 * once overrides and dynamicVariables are fully stable.
	 * Default: false
	 */
	autoStart?: boolean;
}

export const ConversationBar = React.forwardRef<
	HTMLDivElement,
	ConversationBarProps
>(
	(
		{
			agentId,
			userId,
			className,
			waveformClassName,
			isTakeover = false,
			onConnect,
			onDisconnect,
			onError,
			onMessage,
			onSendMessage,
			dynamicVariables,
			overrides,
			onHandover,
			autoStart = false,
		},
		ref,
	) => {
		const [isMuted, setIsMuted] = React.useState(false);
		const [agentState, setAgentState] = React.useState<
			"disconnected" | "connecting" | "connected" | "disconnecting" | null
		>("disconnected");
		const [textInput, setTextInput] = React.useState("");
		const [isVoiceMode, setIsVoiceMode] = React.useState(false);

		const mediaStreamRef = React.useRef<MediaStream | null>(null);
		const isVoiceModeRef = React.useRef(false);
		// Flipped to true on unmount — guards all async continuations
		const unmountedRef = React.useRef(false);
		// Prevents two concurrent startSession calls (React StrictMode double-fire)
		const startingRef = React.useRef(false);

		// ── Context continuity across mode switches ──────────────────────────
		// How many sessions have been started (0 = first ever, >0 = restart)
		const sessionCountRef = React.useRef(0);
		// Rolling log of the current in-page conversation, capped at MAX_HISTORY_LINES
		const conversationHistoryRef = React.useRef<string[]>([]);

		const conversation = useConversation({
			onConnect: () => {
				onConnect?.();
			},
			onDisconnect: () => {
				if (!unmountedRef.current) {
					setAgentState("disconnected");
				}
				onDisconnect?.();
			},
			onMessage: (message) => {
				// Accumulate into the rolling history so we can inject it on the
				// next session start (mode switch or handback after takeover)
				if (message.message?.trim()) {
					const speaker =
						message.source === "user" ? "Patient" : "Hannah";
					const line = `${speaker}: ${message.message.trim()}`;
					conversationHistoryRef.current.push(line);
					// Keep only the most recent lines to avoid prompt bloat
					if (
						conversationHistoryRef.current.length >
						MAX_HISTORY_LINES
					) {
						conversationHistoryRef.current =
							conversationHistoryRef.current.slice(
								-MAX_HISTORY_LINES,
							);
					}
				}
				onMessage?.(message);
			},
			micMuted: isMuted,
			onError: (error: unknown) => {
				if (unmountedRef.current) return;
				console.error("Conversation error:", error);
				setAgentState("disconnected");
				const errorObj =
					error instanceof Error
						? error
						: new Error(
								typeof error === "string"
									? error
									: JSON.stringify(error),
							);
				onError?.(errorObj);
			},
			clientTools: {
				handover_to_human_agent: async (parameters: {
					reason: string;
				}) => {
					console.log(
						"AI requested handover! Reason:",
						parameters.reason,
					);
					onHandover?.(
						parameters.reason || "Patient requested human agent",
					);
					return "handover_initiated";
				},
			},
		});

		// ── Mic helpers ──────────────────────────────────────────────────────

		const getMicStream = React.useCallback(async () => {
			if (mediaStreamRef.current) return mediaStreamRef.current;
			const stream = await navigator.mediaDevices.getUserMedia({
				audio: true,
			});
			mediaStreamRef.current = stream;
			return stream;
		}, []);

		const stopMicStream = React.useCallback(() => {
			mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
			mediaStreamRef.current = null;
		}, []);

		// ── Build overrides for a session start ─────────────────────────────
		//
		// On the FIRST session:  pass overrides as-is (firstMessage + full prompt)
		// On RESTARTS (mode switch / handback):
		//   - Suppress firstMessage so Hannah doesn't re-greet
		//   - Append the rolling conversation history to the prompt so Hannah
		//     has full context of what was already discussed
		const buildOverrides = React.useCallback(
			(voice: boolean) => {
				const base = (overrides ?? {}) as any;
				const isRestart = sessionCountRef.current > 0;

				if (!isRestart) {
					// First session — pass everything unchanged, just add textOnly
					return {
						...base,
						conversation: { textOnly: !voice },
					};
				}

				// Restart — suppress greeting and inject history
				const history = conversationHistoryRef.current;
				const historyBlock =
					history.length > 0
						? `\n\n# Conversation So Far\nYou are already mid-conversation with this patient. Do NOT greet them again or introduce yourself. Continue naturally.\n\n${history.join("\n")}\n\nContinue from here.`
						: "\n\n# Note\nYou are resuming a conversation. Do NOT greet the patient again or re-introduce yourself. Continue naturally from where you left off.";

				const existingPrompt = base?.agent?.prompt?.prompt ?? "";

				return {
					...base,
					agent: {
						...(base?.agent ?? {}),
						firstMessage: "", // ← suppress re-greeting
						prompt: {
							...(base?.agent?.prompt ?? {}),
							prompt: existingPrompt + historyBlock,
						},
					},
					conversation: { textOnly: !voice },
				};
			},
			[overrides],
		);

		// ── Core session start ───────────────────────────────────────────────

		const startConversation = React.useCallback(
			async (voice = false) => {
				// Block concurrent calls — StrictMode fires effects twice in dev
				if (startingRef.current) return;
				startingRef.current = true;

				try {
					if (!unmountedRef.current) {
						setAgentState("connecting");
						isVoiceModeRef.current = voice;
						setIsVoiceMode(voice);
					}

					if (voice) await getMicStream();

					// Guard: component may have unmounted while awaiting mic permission
					if (unmountedRef.current) return;

					const conversationId = await conversation.startSession({
						agentId,
						userId,
						connectionType: voice ? "webrtc" : "websocket",
						dynamicVariables,
						overrides: buildOverrides(voice),
						onStatusChange: (status: {
							status:
								| "connected"
								| "connecting"
								| "disconnected"
								| "disconnecting";
						}) => {
							if (!unmountedRef.current)
								setAgentState(status.status);
						},
					});

					// Guard: component may have unmounted while session was establishing
					if (unmountedRef.current) return;

					// Increment after a successful start so subsequent starts are restarts
					sessionCountRef.current += 1;

					onConnect?.(conversationId);
					console.log(
						`Started ${voice ? "voice" : "text"} session #${sessionCountRef.current}:`,
						conversationId,
					);
				} catch (error: any) {
					const msg: string = error?.message ?? error?.reason ?? "";

					// "Session cancelled during connection" is the expected StrictMode
					// error — swallow it silently and reset state so a retry can proceed
					const isCancellation =
						unmountedRef.current ||
						msg.toLowerCase().includes("cancel") ||
						msg.toLowerCase().includes("aborted");

					if (!unmountedRef.current) {
						setAgentState("disconnected");
						setIsVoiceMode(false);
						isVoiceModeRef.current = false;
					}

					if (!isCancellation) {
						console.error("Start error:", error);
						onError?.(new Error(msg || "Failed to start session"));
					}
				} finally {
					startingRef.current = false;
				}
			},
			// eslint-disable-next-line react-hooks/exhaustive-deps
			[
				agentId,
				userId,
				dynamicVariables,
				buildOverrides,
				getMicStream,
				onConnect,
				onError,
			],
		);

		const handleEndSession = React.useCallback(() => {
			conversation.endSession();
			if (!unmountedRef.current) {
				setAgentState("disconnected");
				setIsVoiceMode(false);
			}
			isVoiceModeRef.current = false;
			stopMicStream();
		}, [conversation, stopMicStream]);

		// ── Unmount cleanup ──────────────────────────────────────────────────
		React.useEffect(() => {
			unmountedRef.current = false;
			return () => {
				unmountedRef.current = true;
				stopMicStream();
			};
		}, [stopMicStream]);

		// ── Auto-start: only fires on the false → true edge of autoStart ────
		const prevAutoStartRef = React.useRef(false);
		React.useEffect(() => {
			const wasReady = prevAutoStartRef.current;
			prevAutoStartRef.current = autoStart;

			if (!wasReady && autoStart) {
				startConversation(false);
			}
		}, [autoStart, startConversation]);

		// ── Takeover: silence AI while human is active ───────────────────────
		React.useEffect(() => {
			if (isTakeover && agentState === "connected") {
				handleEndSession();
			}
		}, [isTakeover, agentState, handleEndSession]);

		// ── Handback: restart text session when takeover ends ────────────────
		const prevTakeoverRef = React.useRef(isTakeover);
		React.useEffect(() => {
			const wasActive = prevTakeoverRef.current;
			prevTakeoverRef.current = isTakeover;

			if (wasActive && !isTakeover && agentState === "disconnected") {
				startConversation(false);
			}
		}, [isTakeover, agentState, startConversation]);

		// ── Voice toggle ─────────────────────────────────────────────────────
		const handleVoiceToggle = React.useCallback(async () => {
			if (agentState === "connecting" || agentState === "disconnecting")
				return;

			if (isVoiceMode) {
				// Downgrade to text
				handleEndSession();
				await new Promise((r) => setTimeout(r, 400));
				startConversation(false);
			} else {
				// Upgrade to voice
				if (agentState === "connected") {
					handleEndSession();
					await new Promise((r) => setTimeout(r, 400));
				}
				startConversation(true);
			}
		}, [agentState, isVoiceMode, handleEndSession, startConversation]);

		const toggleMute = React.useCallback(() => setIsMuted((p) => !p), []);

		// ── Text send ────────────────────────────────────────────────────────
		const handleSendText = React.useCallback(() => {
			if (!textInput.trim()) return;
			const msg = textInput;
			if (!isTakeover) conversation.sendUserMessage(msg);
			setTextInput("");
			onSendMessage?.(msg);
		}, [conversation, textInput, onSendMessage, isTakeover]);

		const isConnected = agentState === "connected" || isTakeover;
		const isTransitioning =
			agentState === "connecting" || agentState === "disconnecting";

		return (
			<div
				ref={ref}
				className={cn(
					"flex w-full items-center gap-2 px-4 py-3 bg-[#1C2D3B]",
					className,
				)}
			>
				{/* ── Inline text input ── */}
				<input
					type="text"
					value={textInput}
					onChange={(e) => {
						const value = e.target.value;
						setTextInput(value);
						if (value.trim() && isConnected)
							conversation.sendContextualUpdate(value);
					}}
					onKeyDown={(e) => {
						if (e.key === "Enter" && !e.shiftKey) {
							e.preventDefault();
							handleSendText();
						}
					}}
					placeholder="Type a message…"
					disabled={!isConnected}
					className={cn(
						"flex-1 min-w-0 rounded-full px-4 py-2.5 text-sm outline-none transition",
						"bg-white/10 text-white placeholder:text-white/30",
						"border border-white/10 focus:border-white/25 focus:bg-white/15",
						"disabled:opacity-40",
					)}
				/>

				{/* ── Mic / mute button ── */}
				<button
					onClick={isVoiceMode ? toggleMute : () => {}}
					disabled={isTransitioning || isTakeover || !isConnected}
					className={cn(
						"flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition",
						"bg-white/10 text-white/60 hover:bg-white/20 hover:text-white",
						"disabled:opacity-40",
						isVoiceMode && isMuted && "bg-white/20 text-white",
					)}
				>
					{isVoiceMode && isMuted ? (
						<MicOff className="h-5 w-5" />
					) : (
						<Mic className="h-5 w-5" />
					)}
				</button>

				{/* ── Right action button ── */}
				{isVoiceMode ? (
					<button
						onClick={handleVoiceToggle}
						disabled={isTransitioning || isTakeover}
						className={cn(
							"flex h-10 shrink-0 items-center gap-2 rounded-full px-4 transition",
							"bg-[#C46843] text-white hover:bg-[#b05a38] disabled:opacity-40",
						)}
					>
						<LiveWaveform
							key={
								agentState === "disconnected"
									? "idle"
									: "active"
							}
							active={isConnected && !isMuted}
							processing={agentState === "connecting"}
							barWidth={2}
							barGap={1}
							barRadius={4}
							fadeEdges={false}
							sensitivity={1.8}
							smoothingTimeConstant={0.85}
							height={16}
							mode="static"
							className={cn("w-8", waveformClassName)}
						/>
						<span className="text-sm font-medium">End</span>
					</button>
				) : textInput.trim() ? (
					<button
						onClick={handleSendText}
						disabled={!isConnected}
						className={cn(
							"flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition",
							"bg-[#C46843] text-white hover:bg-[#b05a38] disabled:opacity-40",
						)}
					>
						<ArrowUpIcon className="h-4 w-4" />
					</button>
				) : (
					<button
						onClick={handleVoiceToggle}
						disabled={isTransitioning || isTakeover || !isConnected}
						title="Start voice call"
						className={cn(
							"flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition",
							"bg-[#C46843] text-white hover:bg-[#b05a38] disabled:opacity-40",
						)}
					>
						<PhoneIcon className="h-4 w-4" />
					</button>
				)}
			</div>
		);
	},
);

ConversationBar.displayName = "ConversationBar";
