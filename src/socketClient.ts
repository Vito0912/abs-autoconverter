import WebSocket from "ws";
import {
    ABS_TOKEN,
    CONVERSION_DELAY,
    EMBED_METADATA,
    EXCLUDED_CODECS,
    MAX_PARALLEL,
    CONVERSION_MATRIX_STRING,
    getWebSocketUrl, ENCODE_LIBRARY, DRY_RUN,
} from "./config";
import {
    parseConversionMatrix,
    findConversion,
    ConversionMatrix,
} from "./conversionUtils";
import { AbsApiClient } from "./absApiClient";
import axios from "axios";

const ENGINE_IO_PACKET_OPEN = "0";
const ENGINE_IO_PACKET_PING = "2";
const ENGINE_IO_PACKET_PONG = "3";
const ENGINE_IO_PACKET_MESSAGE = "4";

const SOCKET_IO_MSG_CONNECT = "0";
const SOCKET_IO_MSG_EVENT = "2";
const SOCKET_IO_MSG_DISCONNECT_NAMESPACE = "1";

/**
 * Manages the WebSocket connection to Audiobookshelf,
 * processes incoming messages, and controls the encoding process.
 */
export class SocketClient {
    private ws: WebSocket | null = null;
    private wsUrl: string;
    private apiClient: AbsApiClient;
    private encodingQueue: string[] = [];
    private runningEncodings: number = 0;
    private conversionMatrix: ConversionMatrix;
    private reconnectTimeout: NodeJS.Timeout | null = null;
    private readonly RECONNECT_DELAY_MS = 5000;
    private initialScanPerformed: boolean = false;

    constructor() {
        this.wsUrl = getWebSocketUrl();
        this.apiClient = new AbsApiClient();
        this.conversionMatrix = parseConversionMatrix(CONVERSION_MATRIX_STRING);
        console.log("Parsed Conversion Matrix:", this.conversionMatrix);
    }

    /**
     * Establishes the WebSocket connection and initializes event handlers.
     */
    public connect(): void {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }

        console.log(`Attempting to connect to WebSocket at: ${this.wsUrl}`);
        this.ws = new WebSocket(this.wsUrl);

        this.ws.on("open", this.onOpen.bind(this));
        this.ws.on("message", this.onMessage.bind(this));
        this.ws.on("error", this.onError.bind(this));
        this.ws.on("close", this.onClose.bind(this));
    }

    /**
     * Called when the WebSocket connection is opened.
     * Sends the initial Socket.IO handshake message.
     */
    private onOpen(): void {
        console.log(
            "WebSocket connection established. Waiting for Socket.IO handshake.",
        );
        setTimeout(() => {
            this.sendRawSocketMessage(
                `${ENGINE_IO_PACKET_MESSAGE}${SOCKET_IO_MSG_CONNECT}`,
            );
        }, 1000);
    }

    /**
     * Processes incoming WebSocket messages.
     * @param data - The received data.
     */
    private onMessage(data: WebSocket.Data): void {
        const messageStr = data.toString();
        if (messageStr != '2' && !messageStr.includes('task_progress') && !messageStr.includes('track_progress')) console.log(`Received raw data: ${messageStr.substring(0, 30)}...`);

        if (messageStr === ENGINE_IO_PACKET_PING) {
            // console.log("Received PING, sending PONG");
            this.sendRawSocketMessage(ENGINE_IO_PACKET_PONG);
            return;
        }

        if (messageStr.startsWith(ENGINE_IO_PACKET_OPEN)) {
            console.log("Socket.IO (Engine.IO) OPEN packet received:", messageStr);
            return;
        }

        if (
            messageStr.startsWith(
                `${ENGINE_IO_PACKET_MESSAGE}${SOCKET_IO_MSG_CONNECT}`,
            )
        ) {
            console.log("Socket.IO CONNECT to namespace packet received.");
            console.log("Attempting to authenticate via Socket.IO message...");
            this.sendSocketIoEvent("auth", ABS_TOKEN);
            if(ENCODE_LIBRARY) setTimeout(() => {
                if (!this.initialScanPerformed) {
                    console.log(
                        "Performing initial library scan for items to convert...",
                    );
                    this.performInitialLibraryScan().catch((err) => {
                        console.error("Initial library scan encountered an error:", err);
                        this.initialScanPerformed = true;
                    });
                }
            })
            return;
        }

        if (
            messageStr.startsWith(
                `${ENGINE_IO_PACKET_MESSAGE}${SOCKET_IO_MSG_EVENT}`,
            )
        ) {
            const jsonArrayString = messageStr.substring(2);
            try {
                const parsedArray = JSON.parse(jsonArrayString);
                if (Array.isArray(parsedArray) && parsedArray.length > 0) {
                    const eventName: string = parsedArray[0];
                    const payload: any = parsedArray[1] || {};
                    this.handleSocketIoEvent(eventName, payload);
                } else {
                    console.error(
                        "Parsed Socket.IO event data is not a valid array or is empty:",
                        parsedArray,
                    );
                }
            } catch (error) {
                console.error(
                    "Failed to parse JSON from Socket.IO event message:",
                    error,
                );
                console.error("Problematic JSON string:", jsonArrayString);
            }
        }
    }

    /**
     * Performs an initial scan of all libraries and their items,
     * enqueuing them for potential conversion.
     */
    private async performInitialLibraryScan(): Promise<void> {
        console.log("Starting initial library scan...");
        try {
            const libraries = await this.apiClient.getLibraries();
            if (!libraries || libraries.length === 0) {
                console.log("No libraries found to scan.");
                this.initialScanPerformed = true;
                return;
            }

            console.log(`Found ${libraries.length} libraries. Fetching items...`);
            let itemsEnqueuedThisScan = 0;
            for (const library of libraries) {
                if (library.mediaType !== 'book') continue
                console.log(`Scanning library: ${library.id}`);
                try {
                    const items = await this.apiClient.getLibraryItems(library.id);
                    if (items && items.length > 0) {
                        console.log(
                            `Found ${items.length} items in library ${library.id}. Enqueuing...`,
                        );
                        for (const item of items) {
                            if (item.id && !this.encodingQueue.includes(item.id)) {
                                this.encodingQueue.push(item.id);
                                itemsEnqueuedThisScan++;
                            }
                        }
                    } else {
                        console.log(`No items found in library ${library.id}.`);
                    }
                } catch (error) {
                    console.error(
                        `Failed to fetch items for library ${library.id}:`,
                        error,
                    );
                }
            }

            console.log(
                `Initial scan complete. Total items enqueued from this scan: ${itemsEnqueuedThisScan}. Current queue size: ${this.encodingQueue.length}`,
            );
            this.initialScanPerformed = true;

            if (itemsEnqueuedThisScan > 0) {
                const delay = CONVERSION_DELAY > 0 ? CONVERSION_DELAY : 2000;
                console.log(
                    `Processing queue after initial scan in ${delay / 1000} seconds...`,
                );
                setTimeout(() => {
                    for (let i = this.runningEncodings; i < MAX_PARALLEL; i++) {
                        void this.processEncodingQueue();
                    }
                }, delay);
            }
        } catch (error) {
            console.error("Error during initial library scan process:", error);
            this.initialScanPerformed = true; // Mark as attempted to avoid retries
        }
    }

    /**
     * Handles specific Socket.IO events.
     * @param eventName - The name of the event (e.g., "item_added").
     * @param payload - The data associated with the event.
     */
    private handleSocketIoEvent(eventName: string, payload: any): void {
        //console.log(`Received Socket.IO Event: ${eventName}`);
        switch (eventName) {
            case "auth_success":
                console.log("Socket.IO authentication successful.");
                break;
            case "auth_error":
                console.error("Socket.IO authentication failed:", payload);
                break;
            case "item_added":
                console.log("Item added event:", payload);
                if (payload && payload.id) {
                    this.encodingQueue.push(payload.id);
                    console.log(
                        `Item ${payload.id} added to queue. Queue size: ${this.encodingQueue.length}`,
                    );
                    setTimeout(() => {
                        void this.processEncodingQueue();
                    }, CONVERSION_DELAY);
                } else {
                    console.warn("Item_added event received without valid payload.id");
                }
                break;
            case "task_finished":
                const action = payload?.action;
                if (typeof action === "string" && action.includes("encode")) {
                    console.log("Encoding finished for item:", payload.id);
                    this.runningEncodings--;
                    if (EMBED_METADATA && payload?.data?.libraryItemId) {
                        setTimeout(async () => {
                            try {
                                await this.apiClient.embedMetadata(payload.data.libraryItemId);
                            } catch (error) {
                                console.error(
                                    `Failed to embed metadata for ${payload.data.libraryItemId}:`,
                                    error,
                                );
                            }
                        }, 60000);
                    }

                    for (let i = this.runningEncodings; i < MAX_PARALLEL; i++) {
                        void this.processEncodingQueue();
                    }
                }
                break;
            case "task_progress":
                const taskId = payload?.libraryItemId;
                const progress = payload?.progress;

                // Print progress every 10% (0.1% deviation allowed)
                if (progress && taskId) {
                    const progressPercentage = Math.round(progress * 100) / 100;
                    // Maybe better way here. Currently have no in mind. Will skip some percentages and double print some
                    if (progressPercentage % 10 < 0.1) {
                        console.log(
                            `Task ${taskId} progress: ${progressPercentage}%`,
                        );
                    }
                } else {
                    console.warn("Task progress event received without valid payload");
                }


                break;
            default:
                break;
        }
    }

    /**
     * Processes the encoding queue.
     * Starts new encoding tasks if capacity is available.
     */
    private async processEncodingQueue(): Promise<void> {
        if (this.encodingQueue.length === 0) {
            if (DRY_RUN) {
                console.log("Dry run mode: No items in queue. Exiting.");
                this.shutdown();
            }
            return;
        }

        if (this.runningEncodings >= MAX_PARALLEL) {
            console.log(
                `Max parallel tasks (${MAX_PARALLEL}) reached. Waiting for completion. Queue size: ${this.encodingQueue.length}`,
            );
            return;
        }

        const itemId = this.encodingQueue.shift();
        if (!itemId) return;

        console.log(`Processing item ${itemId} from queue.`);
        this.runningEncodings++;


        try {
            const itemDetails = await this.apiClient.getItemDetails(itemId);
            const audioFiles = itemDetails?.media?.audioFiles;

            if (!audioFiles || audioFiles.length === 0) {
                console.log(`No audio files found for item: ${itemId}. Skipping.`);
                this.runningEncodings--;
                void this.processEncodingQueue();
                return;
            }

            const audioFile = audioFiles[0];
            const { codec, bitRate, channels } = audioFile;

            if (EXCLUDED_CODECS.includes(codec.toLowerCase())) {
                console.log(
                    `Codec ${codec} for item ${itemId} is excluded. Skipping.`,
                );
                this.runningEncodings--;
                void this.processEncodingQueue();
                return;
            }

            const conversionProfile = findConversion(
                this.conversionMatrix,
                codec,
                bitRate,
                channels,
            );

            if (!conversionProfile) {
                console.log(
                    `No suitable conversion profile found for item ${itemId} (Codec: ${codec}, Bitrate: ${bitRate}, Channels: ${channels}). Skipping.`,
                );
                this.runningEncodings--;
                void this.processEncodingQueue();
                return;
            }

            console.log(
                `Found conversion for item ${itemId}:`,
                conversionProfile,
                `Original: ${codec}, ${bitRate}bps, ${channels}ch`,
            );

            await this.apiClient.startM4bEncoding(
                itemId,
                conversionProfile.codec,
                conversionProfile.bitrate,
                conversionProfile.channels,
            );
            try {
                this.runningEncodings = await this.apiClient.getTasks()
            } catch (error) {

            }
        } catch (error) {
            console.error(`Error processing item ${itemId}:`, error);
            this.runningEncodings--;
            void this.processEncodingQueue();
        }
    }

    /**
     * Sends a raw message over the WebSocket.
     * @param message - The message to send.
     */
    private sendRawSocketMessage(message: string): void {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            if (message != '3') console.log(`Sending raw WebSocket message: ${message}`);
            this.ws.send(message);
        } else {
            console.error(
                "WebSocket is not open. Cannot send raw WebSocket message.",
            );
        }
    }

    /**
     * Sends a Socket.IO event with a payload.
     * @param eventName - The name of the event.
     * @param payload - The data to send.
     */
    private sendSocketIoEvent(eventName: string, payload: any): void {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const messageArray = [eventName, payload];
            const message = `${ENGINE_IO_PACKET_MESSAGE}${SOCKET_IO_MSG_EVENT}${JSON.stringify(messageArray)}`;
            console.log(`Sending Socket.IO event: ${eventName}`);
            this.ws.send(message);
        } else {
            console.error("WebSocket is not open. Cannot send Socket.IO event.");
        }
    }

    /**
     * Called on a WebSocket error.
     * @param error - The error object.
     */
    private onError(error: Error): void {
        console.error("WebSocket Error:", error.message);
    }

    /**
     * Called when the WebSocket connection is closed.
     * Attempts to reconnect after a delay.
     * @param code - The closing code.
     * @param reason - The reason for closing.
     */
    private onClose(code: number, reason: Buffer): void {
        console.log(
            `WebSocket disconnected. Code: ${code}, Reason: ${reason.toString()}. Attempting to reconnect in ${this.RECONNECT_DELAY_MS / 1000}s...`,
        );
        if (this.ws) {
            this.ws.removeAllListeners();
        }
        this.ws = null;
        if (!this.reconnectTimeout) {
            this.reconnectTimeout = setTimeout(
                () => this.connect(),
                this.RECONNECT_DELAY_MS,
            );
        }
    }

    /**
     * Closes the WebSocket connection gracefully.
     */
    public shutdown(): void {
        console.log("Shutting down SocketClient...");
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.sendRawSocketMessage(
                `${ENGINE_IO_PACKET_MESSAGE}${SOCKET_IO_MSG_DISCONNECT_NAMESPACE}`,
            );
            this.ws.close();
        } else if (this.ws) {
            this.ws.terminate();
        }
        console.log("SocketClient shut down.");
        // Exiting process
        if (this.encodingQueue.length === 0) {
            console.log("No items in queue. Exiting process.");
            process.exit(0);
        } else {
            console.log(
                `Items remaining in queue: ${this.encodingQueue.length}. Not exiting process.`,
            );
        }
    }
}
