"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "../context/AuthContext";

/* ── Icon helpers ─────────────────────────────────────────────────────────── */
function ChatIcon() {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			className="h-8 w-8"
		>
			<path d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z" />
		</svg>
	);
}

function AdminIcon() {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			className="h-8 w-8"
		>
			<path d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
		</svg>
	);
}

function ChevronRightIcon() {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 20 20"
			fill="currentColor"
			className="h-5 w-5"
		>
			<path
				fillRule="evenodd"
				d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
				clipRule="evenodd"
			/>
		</svg>
	);
}

/* ── Page ─────────────────────────────────────────────────────────────────── */
export default function HomePage() {
	const { user, isInitialized, logout } = useAuth();
	const router = useRouter();

	useEffect(() => {
		if (isInitialized && !user) router.replace("/login");
	}, [isInitialized, user, router]);

	if (!isInitialized || !user) {
		return (
			<div className="flex h-screen items-center justify-center bg-[#1C2D3B]">
				<div className="w-8 h-8 rounded-full border-2 border-[#C46843]/30 border-t-[#C46843] animate-spin" />
			</div>
		);
	}

	const firstName = user.firstName || "there";

	return (
		<div className="flex min-h-screen flex-col bg-[#1C2D3B]">
			{/* ── Top bar ── */}
			<header className="flex items-center justify-between px-6 pt-12 pb-4 max-w-md mx-auto w-full">
				<span className="text-white text-lg font-light tracking-[0.55em]">
					NUORO
				</span>
				<button
					onClick={logout}
					className="rounded-full border border-[#C46843]/60 px-3 py-1 text-[#C46843] text-xs font-medium hover:bg-[#C46843]/10 transition"
				>
					Sign out
				</button>
			</header>

			{/* ── Main ── */}
			<main className="flex flex-col flex-1 max-w-md mx-auto w-full px-6 pt-6 pb-12">
				{/* Welcome */}
				<div className="mb-10">
					<p className="text-white/40 text-xs font-semibold tracking-[0.2em] uppercase mb-1.5">
						Welcome back
					</p>
					<h1 className="text-white text-3xl font-bold leading-tight">
						Hello, {firstName} 👋
					</h1>
					<p className="mt-2 text-white/50 text-sm leading-relaxed">
						How can we support you today?
					</p>
				</div>

				{/* Cards */}
				<div className="flex flex-col gap-4">
					<NavCard
						href="/chat_v2"
						icon={<ChatIcon />}
						title="Talk to Hannah"
						subtitle="Your AI-assisted care companion. Book, reschedule, or get support."
						accentColor="#C46843"
						badge="AI Assistant"
					/>

					<NavCard
						href="/admin"
						icon={<AdminIcon />}
						title="Admin"
						subtitle="Manage settings, view reports and configure the platform."
						accentColor="#4A7FA5"
						badge="Coming soon"
						disabled
					/>
				</div>
			</main>
		</div>
	);
}

/* ── NavCard ─────────────────────────────────────────────────────────────────── */
interface NavCardProps {
	href: string;
	icon: React.ReactNode;
	title: string;
	subtitle: string;
	accentColor: string;
	badge?: string;
	disabled?: boolean;
}

function NavCard({
	href,
	icon,
	title,
	subtitle,
	accentColor,
	badge,
	disabled = false,
}: NavCardProps) {
	return (
		/**
		 * Using a real <a> tag so the browser's native context menu
		 * "Open link in new tab" works on right-click.
		 * For left-clicks we let Next.js handle history push via href.
		 */
		<a
			href={disabled ? undefined : href}
			aria-disabled={disabled}
			className={[
				"group relative flex items-start gap-5 rounded-2xl border p-5 overflow-hidden no-underline",
				"transition-all duration-300 ease-out select-none",
				disabled
					? "opacity-55 cursor-not-allowed border-white/10 bg-white/[0.03]"
					: "cursor-pointer border-white/10 bg-white/[0.04] hover:border-white/20 hover:bg-white/[0.08] active:scale-[0.985]",
			].join(" ")}
			onClick={(e) => {
				if (disabled) e.preventDefault();
			}}
			style={{ "--accent": accentColor } as React.CSSProperties}
		>
			{/* Hover glow */}
			{!disabled && (
				<div
					className="pointer-events-none absolute -top-12 -right-12 h-36 w-36 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-3xl"
					style={{ background: `${accentColor}1A` }}
				/>
			)}

			{/* Icon */}
			<div
				className="flex-shrink-0 flex h-14 w-14 items-center justify-center rounded-xl"
				style={{
					background: `${accentColor}18`,
					color: accentColor,
					border: `1px solid ${accentColor}28`,
				}}
			>
				{icon}
			</div>

			{/* Text */}
			<div className="flex-1 min-w-0">
				<div className="flex flex-wrap items-center gap-2 mb-1">
					<span className="text-white font-semibold text-base leading-tight">
						{title}
					</span>
					{badge && (
						<span
							className="rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase"
							style={{
								background: `${accentColor}1A`,
								color: accentColor,
								border: `1px solid ${accentColor}28`,
							}}
						>
							{badge}
						</span>
					)}
				</div>
				<p className="text-white/45 text-sm leading-relaxed">{subtitle}</p>
			</div>

			{/* Arrow */}
			{!disabled && (
				<div className="flex-shrink-0 self-center ml-1 text-white/25 group-hover:text-white/55 group-hover:translate-x-0.5 transition-all duration-200">
					<ChevronRightIcon />
				</div>
			)}
		</a>
	);
}
