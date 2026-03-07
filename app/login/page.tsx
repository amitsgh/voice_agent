"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";

const COUNTRY_CODES = [
	{ value: "+91", label: "IN +91" },
	{ value: "+1", label: "US +1" },
	{ value: "+44", label: "GB +44" },
	{ value: "+61", label: "AU +61" },
	{ value: "+971", label: "AE +971" },
	{ value: "+65", label: "SG +65" },
];

export default function LoginPage() {
	const { requestOtp, verifyOtp, user, isInitialized } = useAuth();
	const router = useRouter();

	const [step, setStep] = useState<"phone" | "otp">("phone");
	const [countryCode, setCountryCode] = useState("+91");
	const [phone, setPhone] = useState("");
	const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [resendSecs, setResendSecs] = useState(30);
	const resendRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

	useEffect(() => {
		if (isInitialized && user) router.replace("/chat_v2");
	}, [isInitialized, user, router]);

	const startResendTimer = () => {
		setResendSecs(30);
		if (resendRef.current) clearInterval(resendRef.current);
		resendRef.current = setInterval(() => {
			setResendSecs((s) => {
				if (s <= 1) {
					clearInterval(resendRef.current!);
					return 0;
				}
				return s - 1;
			});
		}, 1000);
	};

	const handleSendOtp = async () => {
		if (!phone.trim()) {
			setError("Please enter your phone number.");
			return;
		}
		setError(null);
		setLoading(true);
		const res = await requestOtp(phone, countryCode);
		setLoading(false);
		if (res.success) {
			setStep("otp");
			startResendTimer();
		} else setError(res.error ?? "Failed to send OTP.");
	};

	const handleVerify = async () => {
		const code = otpDigits.join("");
		if (code.length < 6) {
			setError("Please enter all 6 digits.");
			return;
		}
		setError(null);
		setLoading(true);
		const res = await verifyOtp(phone, countryCode, code);
		setLoading(false);
		if (res.success) router.push("/chat_v2");
		else setError(res.error ?? "Verification failed.");
	};

	const handleOtpChange = (index: number, value: string) => {
		const digit = value.replace(/\D/g, "").slice(-1);
		const next = [...otpDigits];
		next[index] = digit;
		setOtpDigits(next);
		if (digit && index < 5) otpRefs.current[index + 1]?.focus();
	};

	const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
		if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
			otpRefs.current[index - 1]?.focus();
		}
	};

	const handleOtpPaste = (e: React.ClipboardEvent) => {
		const pasted = e.clipboardData
			.getData("text")
			.replace(/\D/g, "")
			.slice(0, 6);
		if (!pasted) return;
		const next = [...otpDigits];
		pasted.split("").forEach((d, i) => {
			next[i] = d;
		});
		setOtpDigits(next);
		otpRefs.current[Math.min(pasted.length, 5)]?.focus();
	};

	const formattedPhone = `${countryCode} ${phone}`;

	if (step === "phone")
		return (
			<div className="flex min-h-screen max-w-md mx-auto overflow-y-auto flex-col bg-[#1C2D3B] px-6">
				<div className="flex justify-center pt-12 pb-2">
					<span className="text-white text-lg font-light tracking-[0.55em]">
						NUORO
					</span>
				</div>

				<div className="mt-16">
					<h1 className="text-white text-4xl font-bold leading-tight">
						Welcome.
					</h1>
					<p className="mt-2 text-white/60 text-base">
						Your personal care journey starts here.
					</p>
				</div>

				<div className="mt-12">
					<div className="flex items-end gap-3 border-b border-[#C46843] pb-2">
						<select
							value={countryCode}
							onChange={(e) => setCountryCode(e.target.value)}
							className="bg-transparent text-white text-sm outline-none cursor-pointer"
						>
							{COUNTRY_CODES.map((cc) => (
								<option
									key={cc.value}
									value={cc.value}
									className="bg-[#1C2D3B]"
								>
									{cc.label}
								</option>
							))}
						</select>
						<div className="h-5 w-px bg-white/30" />
						<input
							type="tel"
							placeholder="(555) 000-0000"
							value={phone}
							onChange={(e) =>
								setPhone(e.target.value.replace(/\D/g, ""))
							}
							onKeyDown={(e) => {
								if (e.key === "Enter") handleSendOtp();
							}}
							className="flex-1 bg-transparent text-white placeholder-white/30 text-base outline-none"
							autoComplete="tel"
						/>
					</div>
					<p className="mt-2 text-white/40 text-xs">
						We'll never share your number.
					</p>
					{error && (
						<p className="mt-3 text-red-400 text-sm">{error}</p>
					)}
				</div>

				<button
					onClick={handleSendOtp}
					disabled={loading}
					className="mt-8 w-full rounded-full bg-[#C46843] py-4 text-white font-semibold text-base disabled:opacity-50 transition-opacity"
				>
					{loading ? "Sending…" : "Continue"}
				</button>

				<div className="mt-8 flex items-center gap-3">
					<div className="flex-1 h-px bg-white/15" />
					<span className="text-white/40 text-xs font-medium tracking-widest">
						OR
					</span>
					<div className="flex-1 h-px bg-white/15" />
				</div>

				<button className="mt-4 w-full rounded-full border border-white/20 py-4 text-white font-semibold text-base hover:bg-white/5 transition">
					Sign in with new email
				</button>

				<div className="mt-auto pb-10 flex justify-center">
					<button className="text-white/40 text-sm underline underline-offset-2">
						Learn more about Nuoro
					</button>
				</div>
			</div>
		);

	return (
		<div className="flex min-h-screen max-w-md mx-auto overflow-y-auto flex-col bg-[#1C2D3B] px-6">
			<div className="flex justify-center pt-12 pb-2">
				<span className="text-white text-lg font-light tracking-[0.55em]">
					NUORO
				</span>
			</div>

			<div className="mt-16">
				<h1 className="text-white text-4xl font-bold leading-tight">
					Verify your
					<br />
					number
				</h1>
				<p className="mt-3 text-white/60 text-base leading-relaxed">
					This helps us keep your care private and secure.
				</p>
			</div>

			<div className="mt-6">
				<p className="text-white/50 text-sm">
					Sent to{" "}
					<span className="text-[#C46843] font-medium">
						{formattedPhone}
					</span>
				</p>
				<button
					onClick={() => {
						setStep("phone");
						setOtpDigits(["", "", "", "", "", ""]);
						setError(null);
					}}
					className="mt-1 text-[#C46843] text-sm font-medium"
				>
					Change Number
				</button>
			</div>

			<div className="mt-8 flex items-center justify-between gap-2">
				{otpDigits.map((digit, i) => (
					<input
						key={i}
						ref={(el) => {
							otpRefs.current[i] = el;
						}}
						type="text"
						inputMode="numeric"
						maxLength={1}
						value={digit}
						onChange={(e) => handleOtpChange(i, e.target.value)}
						onKeyDown={(e) => handleOtpKeyDown(i, e)}
						onPaste={handleOtpPaste}
						className={[
							"w-11 h-11 rounded-lg border text-center text-white text-xl font-semibold",
							"bg-transparent outline-none transition-colors flex-shrink-0",
							digit ? "border-[#C46843]" : "border-white/25",
						].join(" ")}
					/>
				))}
			</div>

			{error && <p className="mt-4 text-red-400 text-sm">{error}</p>}

			<button
				onClick={handleVerify}
				disabled={loading || otpDigits.join("").length < 6}
				className="mt-10 w-full rounded-full bg-[#C46843] py-4 text-white font-semibold text-base disabled:opacity-50 transition-opacity"
			>
				{loading ? "Verifying…" : "Verify & Continue"}
			</button>

			<div className="mt-4 flex justify-center">
				{resendSecs > 0 ? (
					<span className="text-white/40 text-sm flex items-center gap-2">
						<span className="flex h-5 w-5 items-center justify-center rounded-full border border-white/30 text-[10px]">
							{resendSecs}
						</span>
						Wait {resendSecs}s to resend code
					</span>
				) : (
					<button
						onClick={() => {
							handleSendOtp();
							startResendTimer();
						}}
						className="text-[#C46843] text-sm font-medium"
					>
						Resend code
					</button>
				)}
			</div>

			<div className="mt-auto pb-10 flex justify-center">
				<button className="text-white/40 text-sm underline underline-offset-2">
					Need help? Visit our website
				</button>
			</div>
		</div>
	);
}
