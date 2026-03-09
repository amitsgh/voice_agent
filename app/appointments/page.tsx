"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Calendar, ChevronLeft, Clock, MapPin } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
	Appointment,
	APPOINTMENT_TYPES_LIST_QUERY,
	AppointmentType,
	AppointmentTypesListResponse,
	gqlFetch,
	LocationDetail,
	LOCATIONS_LIST_BY_TYPE_QUERY,
	LocationsListByTypeResponse,
	MY_APPOINTMENTS_QUERY,
	MyAppointmentsResponse,
	Provider,
	PROVIDERS_GET_QUERY,
	ProvidersGetResponse,
} from "../lib/graphql";

export default function AppointmentsPage() {
	const { user, accessToken, isInitialized } = useAuth();
	const router = useRouter();

	const [appointments, setAppointments] = useState<Appointment[]>([]);
	const [loading, setLoading] = useState(true);
	const [activeTab, setActiveTab] = useState<"upcoming" | "past">("upcoming");
	const [filterDate, setFilterDate] = useState<string>("");

	// Real data maps
	const [appointmentTypes, setAppointmentTypes] = useState<
		Record<string, AppointmentType>
	>({});
	const [providers, setProviders] = useState<Record<string, Provider>>({});
	const [locations, setLocations] = useState<Record<string, LocationDetail>>(
		{},
	);

	useEffect(() => {
		if (isInitialized && (!user || !accessToken)) router.replace("/login");
	}, [isInitialized, user, accessToken, router]);

	useEffect(() => {
		async function fetchData() {
			if (!user || !accessToken) return;

			try {
				setLoading(true);
				// 1. Fetch Appointments
				const appointmentsRes = await gqlFetch<MyAppointmentsResponse>(
					MY_APPOINTMENTS_QUERY,
					{ userId: null },
					accessToken,
				);

				const apps =
					appointmentsRes.data?.myAppointments?.appointments || [];
				setAppointments(apps);

				// 2. Fetch Appointment Types
				const typesRes = await gqlFetch<AppointmentTypesListResponse>(
					APPOINTMENT_TYPES_LIST_QUERY,
					{},
					accessToken,
				);
				const typesMap: Record<string, AppointmentType> = {};
				typesRes.data?.appointmentTypesList?.forEach((t) => {
					typesMap[t.id] = t;
				});
				setAppointmentTypes(typesMap);

				// 3. Fetch unique info for Providers and Locations
				const uniqueTypeProviderPairs = Array.from(
					new Set(
						apps.map(
							(a) => `${a.appointmentTypeId}|${a.providerId}`,
						),
					),
				);

				// Fetch Providers for these types
				const uniqueTypeIds = Array.from(
					new Set(apps.map((a) => a.appointmentTypeId)),
				);
				for (const typeId of uniqueTypeIds) {
					const pRes = await gqlFetch<ProvidersGetResponse>(
						PROVIDERS_GET_QUERY,
						{ appointmentTypeId: typeId },
						accessToken,
					);
					pRes.data?.providersGet?.forEach((p) => {
						setProviders((prev) => ({ ...prev, [p.id]: p }));
					});
				}

				// Fetch Locations for unique type/provider pairs
				for (const pair of uniqueTypeProviderPairs) {
					const [tId, pId] = pair.split("|");
					if (!tId || !pId) continue;

					const lRes = await gqlFetch<LocationsListByTypeResponse>(
						LOCATIONS_LIST_BY_TYPE_QUERY,
						{ appointmentTypeId: tId, providerId: pId },
						accessToken,
					);
					lRes.data?.locationsListWithProviderAvailabilitiesByAppointmentType?.forEach(
						(l) => {
							setLocations((prev) => ({ ...prev, [l.id]: l }));
						},
					);
				}
			} catch (err) {
				console.error("Failed to fetch appointment data:", err);
			} finally {
				setLoading(false);
			}
		}

		if (user && accessToken) {
			fetchData();
		}
	}, [user, accessToken]);

	const filteredAppointments = useMemo(() => {
		const now = new Date();
		let list = appointments.filter((app) => {
			const startTime = new Date(app.startTime);
			if (activeTab === "upcoming") {
				return startTime >= now;
			} else {
				return startTime < now;
			}
		});

		if (filterDate) {
			list = list.filter((app) => {
				const appDate = new Date(app.startTime)
					.toISOString()
					.split("T")[0];
				return appDate === filterDate;
			});
		}

		return list.sort((a, b) => {
			const timeA = new Date(a.startTime).getTime();
			const timeB = new Date(b.startTime).getTime();
			return activeTab === "upcoming" ? timeA - timeB : timeB - timeA;
		});
	}, [appointments, activeTab, filterDate]);

	const formatDateLabel = (isoDate: string) => {
		const date = new Date(isoDate);
		const today = new Date();
		const tomorrow = new Date();
		tomorrow.setDate(today.getDate() + 1);

		const isToday = date.toDateString() === today.toDateString();
		const isTomorrow = date.toDateString() === tomorrow.toDateString();

		const formatted = date.toLocaleDateString("en-US", {
			weekday: "long",
			month: "short",
			day: "numeric",
		});

		if (isToday)
			return `Today, ${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
		if (isTomorrow)
			return `Tomorrow, ${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

		return formatted;
	};

	const formatTimeRange = (start: string, end: string) => {
		const startDate = new Date(start);
		const endDate = new Date(end);

		const startTimeStr = startDate.toLocaleTimeString("en-US", {
			hour: "numeric",
			minute: "2-digit",
			hour12: true,
		});
		const durationMin = Math.round(
			(endDate.getTime() - startDate.getTime()) / (1000 * 60),
		);

		return `${startTimeStr} | ${durationMin} min`;
	};

	if (!isInitialized || !user || loading) {
		return (
			<div className="flex h-screen items-center justify-center bg-[#1C2D3B]">
				<div className="w-8 h-8 rounded-full border-2 border-[#C46843]/30 border-t-[#C46843] animate-spin" />
			</div>
		);
	}

	return (
		<div className="flex min-h-screen flex-col bg-[#1C2D3B] text-white">
			<div className="max-w-md mx-auto w-full flex flex-col h-full flex-1">
				{/* Header */}
				<div className="sticky top-0 z-20 flex items-center gap-4 bg-[#1C2D3B] px-4 pt-12 pb-6">
					<button
						onClick={() => router.back()}
						className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-white/70 hover:bg-white/10 hover:text-white transition-all underline decoration-transparent active:scale-95"
					>
						<ChevronLeft className="h-6 w-6" />
					</button>
					<div className="flex flex-col">
						<h1 className="text-2xl font-bold tracking-tight">
							All Appointments
						</h1>
						<p className="text-sm text-white/50">
							Manage your sessions
						</p>
					</div>
				</div>

				<div className="flex-1 px-4 pb-12 overflow-y-auto no-scrollbar">
					{/* Controls */}
					<div className="mb-8 flex items-center justify-between gap-4">
						<div className="flex w-full rounded-2xl bg-[#0F1D27] p-1.5 shadow-inner">
							<button
								onClick={() => setActiveTab("upcoming")}
								className={cn(
									"flex-1 rounded-[14px] py-2.5 text-sm font-semibold transition-all duration-200",
									activeTab === "upcoming"
										? "bg-[#C46843] text-white shadow-lg"
										: "text-white/40 hover:text-white/60",
								)}
							>
								Upcoming
							</button>
							<button
								onClick={() => setActiveTab("past")}
								className={cn(
									"flex-1 rounded-[14px] py-2.5 text-sm font-semibold transition-all duration-200",
									activeTab === "past"
										? "bg-[#C46843] text-white shadow-lg"
										: "text-white/40 hover:text-white/60",
								)}
							>
								Past
							</button>
						</div>

						<div className="relative flex-shrink-0">
							<input
								type="date"
								value={filterDate}
								onChange={(e) => setFilterDate(e.target.value)}
								className="absolute inset-0 opacity-0 cursor-pointer z-10 w-full h-full"
							/>
							<div
								className={cn(
									"flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 transition-all hover:bg-white/10",
									filterDate &&
										"text-[#C46843] bg-[#C46843]/10",
								)}
							>
								<Calendar className="h-5 w-5" />
							</div>
							{filterDate && (
								<button
									onClick={(e) => {
										e.preventDefault();
										e.stopPropagation();
										setFilterDate("");
									}}
									className="absolute -top-1 -right-1 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-[#C46843] text-sm font-bold text-white shadow-lg active:scale-95 transition-transform"
								>
									×
								</button>
							)}
						</div>
					</div>

					{/* List */}
					<div className="space-y-6">
						{filteredAppointments.length === 0 ? (
							<div className="flex flex-col items-center justify-center py-20 text-center">
								<div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-white/5 text-white/10">
									<Calendar className="h-10 w-10" />
								</div>
								<p className="text-lg font-medium text-white/50">
									No {activeTab} appointments
								</p>
								{filterDate && (
									<button
										onClick={() => setFilterDate("")}
										className="mt-2 text-sm text-[#C46843] hover:underline"
									>
										Clear date filter
									</button>
								)}
							</div>
						) : (
							filteredAppointments.map((app) => {
								const type =
									appointmentTypes[app.appointmentTypeId];
								const loc = locations[app.locationId];
								const prov = providers[app.providerId];

								const typeName = type?.name || "Consultation";
								const locName = loc?.name || "Nuoro Wellness";
								const locAddr = loc
									? `${loc.address}, ${loc.city}`
									: "Check session details";
								const provName = prov
									? `Dr. ${prov.firstName} ${prov.lastName}`
									: app.createdBy || "Member Support";

								const isPast = activeTab === "past";

								return (
									<div
										key={app.id}
										className="transition-all duration-300"
									>
										<Card className="overflow-hidden border-0 bg-[#243546] shadow-xl rounded-3xl">
											<CardContent className="p-0">
												<div className="p-6">
													<div className="mb-6 flex items-start gap-4">
														<div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 text-white/40">
															{typeName
																.toLowerCase()
																.includes(
																	"virtual",
																) ? (
																<Clock className="h-6 w-6" />
															) : (
																<MapPin className="h-6 w-6" />
															)}
														</div>
														<h3 className="text-xl font-bold text-white/95 leading-tight">
															{typeName}
														</h3>
													</div>

													<div className="space-y-6">
														<div className="flex items-start gap-4">
															<div className="mt-1 flex h-10 w-10 items-center justify-center rounded-2xl bg-white/5 text-white/30">
																<MapPin className="h-5 w-5" />
															</div>
															<div className="flex flex-col gap-0.5">
																<span className="font-bold text-white/90">
																	{locName}
																</span>
																<span className="text-sm text-white/40">
																	{locAddr}
																</span>
															</div>
														</div>

														<div className="flex items-start gap-4">
															<div className="mt-1 flex h-10 w-10 items-center justify-center rounded-2xl bg-white/5 text-white/30">
																<Calendar className="h-5 w-5" />
															</div>
															<div className="flex flex-col gap-0.5">
																<span className="font-bold text-white/90">
																	{formatDateLabel(
																		app.startTime,
																	)}
																</span>
																<span className="text-sm text-white/40">
																	{formatTimeRange(
																		app.startTime,
																		app.endTime,
																	)}
																</span>
															</div>
														</div>

														<div className="flex items-center gap-4">
															<div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#C46843]/20 bg-[#C46843]/10 text-xs font-bold text-[#C46843]">
																{prov?.firstName?.charAt(
																	0,
																) || "N"}
																{prov?.lastName?.charAt(
																	0,
																) || "U"}
															</div>
															<div className="flex flex-col gap-0.5">
																<span className="font-bold text-white/90">
																	{provName}
																</span>
																<span className="text-sm text-white/40">
																	Functional
																	Medicine
																</span>
															</div>
														</div>
													</div>

													{!isPast && (
														<div className="mt-8 flex gap-3">
															<Button className="flex-1 rounded-2xl bg-white/5 py-6 text-sm font-semibold text-white/60 hover:bg-white/10 transition-all border-0">
																Reschedule
															</Button>
															<Button className="flex-1 rounded-2xl bg-[#C46843] py-6 text-sm font-semibold text-white shadow-lg shadow-[#C46843]/20 hover:bg-[#D47853] transition-all">
																Check-in
															</Button>
														</div>
													)}
												</div>
											</CardContent>
										</Card>
									</div>
								);
							})
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
