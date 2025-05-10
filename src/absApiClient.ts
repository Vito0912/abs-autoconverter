import axios, { AxiosInstance, AxiosError } from "axios";
import { ABS_TOKEN, getApiBaseUrl } from "./config";

export interface AudioFileMetadata {
    codec: string;
    channels: number;
    bitRate: number;
}

export interface MediaMetadata {
    audioFiles?: AudioFileMetadata[];
}

export interface AbsItemDetails {
    id: string;
    media?: MediaMetadata;
}

export interface Library {
    id: string;
    mediaType: string;
}

export interface LibrariesResponse {
    libraries: Library[];
}

export interface LibraryItem {
    id: string;
}

export interface LibraryItemsResponse {
    results: LibraryItem[];
}

export class AbsApiClient {
    private client: AxiosInstance;
    private apiBaseUrl: string;

    constructor() {
        this.apiBaseUrl = getApiBaseUrl();
        this.client = axios.create({
            baseURL: this.apiBaseUrl,
            headers: {
                Authorization: `Bearer ${ABS_TOKEN}`,
            },
        });
    }

    /**
     * Retrieves expanded details for a specific item.
     * @param itemId - The ID of the item.
     * @returns A promise that resolves to the {@link AbsItemDetails}.
     * @throws Error if the API request fails or returns no data.
     */
    async getItemDetails(itemId: string): Promise<AbsItemDetails> {
        try {
            const response = await this.client.get<AbsItemDetails>(
                `/api/items/${itemId}?expanded=1`,
            );
            if (!response.data) {
                throw new Error(`No data returned for item ${itemId}`);
            }
            return response.data;
        } catch (error) {
            this.handleApiError(error, `getItemDetails for item ${itemId}`);
            throw error;
        }
    }

    /**
     * Starts M4B encoding for an item with the specified parameters.
     * @param itemId - The ID of the item.
     * @param codec - The target codec.
     * @param bitrate - The target bitrate.
     * @param channels - The target number of channels.
     * @returns A promise that resolves when the request is successful.
     * @throws Error if the API request fails.
     */
    async startM4bEncoding(
        itemId: string,
        codec: string,
        bitrate: string,
        channels: string,
    ): Promise<void> {
        try {
            await this.client.post(
                `/api/tools/item/${itemId}/encode-m4b?codec=${codec}&bitrate=${bitrate}&channels=${channels}`,
                {},
            );
            console.log(
                `Successfully requested M4B encoding for item ${itemId} with ${codec}@${bitrate} ${channels}ch.`,
            );
        } catch (error) {
            this.handleApiError(error, `startM4bEncoding for item ${itemId}`);
            throw error;
        }
    }

    /**
     * Requests metadata embedding for an item.
     * @param itemId - The ID of the item.
     * @returns A promise that resolves when the request is successful.
     * @throws Error if the API request fails.
     */
    async embedMetadata(itemId: string): Promise<void> {
        try {
            await this.client.post(`/api/tools/item/${itemId}/embed-metadata`, {});
            console.log(`Successfully requested metadata embedding for item ${itemId}.`);
        } catch (error) {
            this.handleApiError(error, `embedMetadata for item ${itemId}`);
            throw error;
        }
    }

    /**
     * Retrieves all libraries.
     * @returns A promise that resolves to an array of {@link Library}.
     * @throws Error if the API request fails.
     */
    async getLibraries(): Promise<Library[]> {
        try {
            const response =
                await this.client.get<LibrariesResponse>("/api/libraries");
            return response.data.libraries || [];
        } catch (error) {
            this.handleApiError(error, "getLibraries");
            throw error;
        }
    }

    /**
     * Retrieves all items for a specific library.
     * @param libraryId - The ID of the library.
     * @returns A promise that resolves to an array of {@link LibraryItem}.
     * @throws Error if the API request fails.
     */
    async getLibraryItems(libraryId: string): Promise<LibraryItem[]> {
        try {
            const response = await this.client.get<LibraryItemsResponse>(
                `/api/libraries/${libraryId}/items`,
            );
            return response.data.results || [];
        } catch (error) {
            this.handleApiError(error, `getLibraryItems for library ${libraryId}`);
            throw error;
        }
    }

    async getTasks(): Promise<number> {
        try {
            const response = await this.client.get("/api/tasks");
            return response.data.tasks.length;
        } catch (error) {
            this.handleApiError(error, "getTasks");
            throw error;
        }
    }

    /**
     * Handles API errors and logs them to the console.
     * @param error - The error that occurred.
     * @param context - A description of the context in which the error occurred.
     */
    private handleApiError(error: any, context: string): void {
        if (axios.isAxiosError(error)) {
            const axiosError = error as AxiosError;
            console.error(
                `API Error during ${context}: ${axiosError.message}`,
                axiosError.response?.status,
                axiosError.response?.data,
            );
        } else {
            console.error(`Non-API Error during ${context}:`, error);
        }
    }
}
