import { writable } from 'svelte/store';

export interface RouteDestination {
	order: number;
	name: string;
	displayAddress: string;
	arrivalTime: string;
	departureTime: string;
	description: string;
	travelTimeFromPrevious: string | null;
	transitRoute?: string | null;
	timeSlot?: 'morning' | 'noon' | 'night' | null;
}

export interface RouteResult {
	origin?: { name: string; displayAddress: string };
	transportMode?: string | null;
	startTime?: string | null;
	endDestination?: { name: string; displayAddress: string } | null;
	destinations: RouteDestination[];
	summary: string;
}

export const routeResult = writable<RouteResult | null>(null);
