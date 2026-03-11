"use client";

import { useConversation } from "@elevenlabs/react";
import {
	ArrowUpIcon,
	ChevronDown,
	Keyboard,
	Mic,
	MicOff,
	PhoneIcon,
	XIcon,
} from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LiveWaveform } from "@/components/ui/live-waveform";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

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
		},
		ref,
	) => {
		const [isMuted, setIsMuted] = React.useState(false);
		const [agentState, setAgentState] = React.useState<
			"disconnected" | "connecting" | "connected" | "disconnecting" | null
		>("disconnected");
		const [keyboardOpen, setKeyboardOpen] = React.useState(false);
		const [textInput, setTextInput] = React.useState("");
		const mediaStreamRef = React.useRef<MediaStream | null>(null);

		const conversation = useConversation({
			onConnect: () => {
				// conversationId is passed in startConversation below
				onConnect?.();
			},
			onDisconnect: () => {
				setAgentState("disconnected");
				onDisconnect?.();
				setKeyboardOpen(false);
			},
			onMessage: (message) => {
				onMessage?.(message);
			},
			micMuted: isMuted,
			onError: (error: unknown) => {
				console.error("Error:", error);
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
					if (onHandover) {
						onHandover(
							parameters.reason ||
								"Patient requested human agent",
						);
					}
					// Return a success string so the LLM knows the tool fired successfully
					return "handover_initiated";
				},
			},
		});

		const getMicStream = React.useCallback(async () => {
			if (mediaStreamRef.current) return mediaStreamRef.current;

			const stream = await navigator.mediaDevices.getUserMedia({
				audio: true,
			});
			mediaStreamRef.current = stream;

			return stream;
		}, []);

		const startConversation = React.useCallback(async () => {
			try {
				setAgentState("connecting");

				await getMicStream();

				const conversationId = await conversation.startSession({
					agentId,
					userId,
					connectionType: "webrtc",
					dynamicVariables,
					overrides,
					onStatusChange: (status: {
						status:
							| "connected"
							| "connecting"
							| "disconnected"
							| "disconnecting";
					}) => {
						setAgentState(status.status);
					},
				});

				// startSession resolves once the session is fully established and
				// returns the conversation ID — safe to use it here.
				onConnect?.(conversationId);
				console.log("Started conversation with ID:", conversationId);
			} catch (error: any) {
				console.error("Detailed Start Error:", error);

				const errorMessage =
					error?.message ||
					error?.reason ||
					"Failed to start session";

				setAgentState("disconnected");
				onError?.(new Error(errorMessage));
			}
		}, [
			conversation,
			getMicStream,
			agentId,
			dynamicVariables,
			overrides,
			onError,
			onConnect,
		]);

		const handleEndSession = React.useCallback(() => {
			conversation.endSession();
			setAgentState("disconnected");

			if (mediaStreamRef.current) {
				mediaStreamRef.current.getTracks().forEach((t) => t.stop());
				mediaStreamRef.current = null;
			}
		}, [conversation]);

		React.useEffect(() => {
			if (isTakeover && agentState === "connected") {
				handleEndSession();
			}
		}, [isTakeover, agentState, handleEndSession]);

		const prevTakeoverRef = React.useRef(isTakeover);
		React.useEffect(() => {
			if (prevTakeoverRef.current === true && !isTakeover && agentState === "disconnected") {
				startConversation();
			}
			prevTakeoverRef.current = isTakeover;
		}, [isTakeover, agentState, startConversation]);

		const toggleMute = React.useCallback(() => {
			setIsMuted((prev) => !prev);
		}, []);

		const handleStartOrEnd = React.useCallback(() => {
			if (agentState === "connected" || agentState === "connecting") {
				handleEndSession();
			} else if (agentState === "disconnected") {
				startConversation();
			}
		}, [agentState, handleEndSession, startConversation]);

		const handleSendText = React.useCallback(() => {
			if (!textInput.trim()) return;

			const messageToSend = textInput;
			if (!isTakeover) {
				conversation.sendUserMessage(messageToSend);
			}
			setTextInput("");
			onSendMessage?.(messageToSend);
		}, [conversation, textInput, onSendMessage, isTakeover]);

		const isConnected = agentState === "connected" || isTakeover;

		const handleTextChange = React.useCallback(
			(e: React.ChangeEvent<HTMLTextAreaElement>) => {
				const value = e.target.value;
				setTextInput(value);

				if (value.trim() && isConnected) {
					conversation.sendContextualUpdate(value);
				}
			},
			[conversation, isConnected],
		);

		const handleKeyDown = React.useCallback(
			(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
				if (e.key === "Enter" && !e.shiftKey) {
					e.preventDefault();
					handleSendText();
				}
			},
			[handleSendText],
		);

		React.useEffect(() => {
			return () => {
				if (mediaStreamRef.current) {
					mediaStreamRef.current.getTracks().forEach((t) => t.stop());
				}
			};
		}, []);

		return (
			<div
				ref={ref}
				className={cn(
					"flex w-full items-end justify-center p-4",
					className,
				)}
			>
				<Card className="m-0 w-full gap-0 border p-0 shadow-lg">
					<div className="flex flex-col-reverse">
						<div>
							{keyboardOpen && <Separator />}
							<div className="flex items-center justify-between gap-2 p-2">
								<div className="h-8 w-[120px] md:h-10">
									<div
										className={cn(
											"flex h-full items-center gap-2 rounded-md py-1",
											"bg-foreground/5 text-foreground/70",
										)}
									>
										<div className="h-full flex-1">
											<div
												className={cn(
													"relative flex h-full w-full shrink-0 items-center justify-center overflow-hidden rounded-sm",
													waveformClassName,
												)}
											>
												<LiveWaveform
													key={
														agentState ===
														"disconnected"
															? "idle"
															: "active"
													}
													active={
														isConnected && !isMuted
													}
													processing={
														agentState ===
														"connecting"
													}
													barWidth={3}
													barGap={1}
													barRadius={4}
													fadeEdges={true}
													fadeWidth={24}
													sensitivity={1.8}
													smoothingTimeConstant={0.85}
													height={20}
													mode="static"
													className={cn(
														"h-full w-full transition-opacity duration-300",
														agentState ===
															"disconnected" &&
															"opacity-0",
													)}
												/>
												{agentState ===
													"disconnected" && (
													<div className="absolute inset-0 flex items-center justify-center">
														<span className="text-foreground/50 text-[10px] font-medium">
															Customer Support
														</span>
													</div>
												)}
											</div>
										</div>
									</div>
								</div>
								<div className="flex items-center">
									<Button
										variant="ghost"
										size="icon"
										onClick={toggleMute}
										aria-pressed={isMuted}
										className={cn(
											isMuted ? "bg-foreground/5" : "",
										)}
										disabled={!isConnected || isTakeover}
									>
										{isMuted ? <MicOff /> : <Mic />}
									</Button>
									<Button
										variant="ghost"
										size="icon"
										onClick={() =>
											setKeyboardOpen((v) => !v)
										}
										aria-pressed={keyboardOpen}
										className="relative"
										disabled={!isConnected}
									>
										<Keyboard
											className={
												"h-5 w-5 transform-gpu transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] " +
												(keyboardOpen
													? "scale-75 opacity-0"
													: "scale-100 opacity-100")
											}
										/>
										<ChevronDown
											className={
												"absolute inset-0 m-auto h-5 w-5 transform-gpu transition-all delay-50 duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] " +
												(keyboardOpen
													? "scale-100 opacity-100"
													: "scale-75 opacity-0")
											}
										/>
									</Button>
									<Separator
										orientation="vertical"
										className="mx-1 -my-2.5"
									/>
									<Button
										variant="ghost"
										size="icon"
										onClick={handleStartOrEnd}
										disabled={
											agentState === "disconnecting" || isTakeover
										}
									>
										{isConnected ||
										agentState === "connecting" ? (
											<XIcon className="h-5 w-5" />
										) : (
											<PhoneIcon className="h-5 w-5" />
										)}
									</Button>
								</div>
							</div>
						</div>

						<div
							className={cn(
								"overflow-hidden transition-all duration-300 ease-out",
								keyboardOpen ? "max-h-[120px]" : "max-h-0",
							)}
						>
							<div className="relative px-2 pt-2 pb-2">
								<Textarea
									value={textInput}
									onChange={handleTextChange}
									onKeyDown={handleKeyDown}
									placeholder="Enter your message..."
									className="min-h-[100px] resize-none border-0 pr-12 shadow-none focus-visible:ring-0"
									disabled={!isConnected}
								/>
								<Button
									size="icon"
									variant="ghost"
									onClick={handleSendText}
									disabled={!textInput.trim() || !isConnected}
									className="absolute right-3 bottom-3 h-8 w-8"
								>
									<ArrowUpIcon className="h-4 w-4" />
								</Button>
							</div>
						</div>
					</div>
				</Card>
			</div>
		);
	},
);

ConversationBar.displayName = "ConversationBar";
