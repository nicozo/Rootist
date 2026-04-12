import { writable } from "svelte/store";

export interface RouteDestination {
	order: number;
	name: string;
	displayAddress: string;
	arrivalTime: string;
	departureTime: string;
	description: string;
	travelTimeFromPrevious: string | null;
}

export interface RouteResult {
	origin?: { name: string; displayAddress: string };
	transportMode?: string;
	destinations: RouteDestination[];
	summary: string;
}

export const routeResult = writable<RouteResult | null>(null);
