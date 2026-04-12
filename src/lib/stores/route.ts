import { writable } from "svelte/store";

export interface RouteDestination {
	order: number;
	name: string;
	displayAddress: string;
	arrivalTime: string;
	departureTime: string;
	description: string;
}

export interface RouteResult {
	destinations: RouteDestination[];
	summary: string;
}

export const routeResult = writable<RouteResult | null>(null);
