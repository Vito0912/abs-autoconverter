import dotenv from "dotenv";

dotenv.config();

/**
 * Validates if an environment variable is set and returns its value.
 * Throws an error if the variable is not set.
 * @param varName - The name of the environment variable.
 * @returns The value of the environment variable.
 * @throws Error if the environment variable is not set.
 */
function getEnvVariable(varName: string): string {
    const value = process.env[varName];
    if (!value) {
        console.error(
            `Error: Environment variable ${varName} is not set. Exiting.`,
        );
        process.exit(1);
    }
    return value;
}

/**
 * Host address of the Audiobookshelf server (without protocol prefix).
 * @example "localhost:13378" or "abs.example.com"
 */
export const ABS_HOST_RAW: string = getEnvVariable("ABS_HOST");

/**
 * Authentication token for the Audiobookshelf API.
 */
export const ABS_TOKEN: string = getEnvVariable("ABS_TOKEN");

/**
 * Maximum number of parallel conversion tasks.
 * Default is 1.
 */
export const MAX_PARALLEL: number = parseInt(
    process.env.MAX_PARALLEL || "1",
    10,
);

/**
 * Delay in milliseconds before starting a conversion after an item is added.
 * Default is 15000ms.
 */
export const CONVERSION_DELAY: number = parseInt(
    process.env.CONVERSION_DELAY || "15000",
    10,
);

/**
 * Specifies whether metadata should be embedded after conversion.
 * Default is false.
 */
export const EMBED_METADATA: boolean = process.env.EMBED_METADATA === "true";

/**
 * Conversion matrix string.
 * Defines rules for audio conversion.
 * @example "0|1|63999|1|1=opus|24000|1,0|1|63999|2|2=opus|24000|2,0|64000|256000|1|1=opus|64000|1,0|64000|256000|2|2=opus|64000|2,0|0|0|0|0=opus|64000|2"
 * Default is "copy|0|0".
 */
export const CONVERSION_MATRIX_STRING: string =
    process.env.CONVERSION_MATRIX || "copy|0|0";

/**
 * Whether to run encoding the whole library after startup.
 * Default is false.
 * This is useful for first runs
 */
export const ENCODE_LIBRARY: boolean =
    process.env.ENCODE_LIBRARY === "true";

/**
 * Whether if the program should exit after emptying the queue.
 * Default is false.
 */
export const DRY_RUN: boolean =
    process.env.DRY_RUN === "true" || process.env.DRY_RUN === "1";

/**
 * A comma-separated list of codecs to be excluded from conversion.
 * Comparisons are case-insensitive.
 * @example "aac,mp3"
 * Default is "aac".
 */
export const EXCLUDED_CODECS: string[] = (
    process.env.EXCLUDED_CODECS || "opus"
)
    .toLowerCase()
    .split(",");

/**
 * Constructs the full WebSocket URL based on ABS_HOST_RAW.
 * @returns The full WebSocket URL.
 */
export function getWebSocketUrl(): string {
    let wsUrl = ABS_HOST_RAW;
    if (wsUrl.startsWith("http://")) {
        wsUrl = `ws://${wsUrl.substring(7)}/socket.io/?EIO=4&transport=websocket`;
    } else if (wsUrl.startsWith("https://")) {
        wsUrl = `wss://${wsUrl.substring(8)}/socket.io/?EIO=4&transport=websocket`;
    } else {
        wsUrl = `ws://${wsUrl}/socket.io/?EIO=4&transport=websocket`;
    }
    return wsUrl;
}

/**
 * Constructs the base API URL based on ABS_HOST_RAW.
 * @returns The base API URL.
 */
export function getApiBaseUrl(): string {
    if (ABS_HOST_RAW.startsWith("http://") || ABS_HOST_RAW.startsWith("https://")) {
        return ABS_HOST_RAW;
    }
    return `http://${ABS_HOST_RAW}`;
}

console.log("Configuration loaded:");
console.log(`  ABS_HOST_RAW: ${ABS_HOST_RAW}`);
console.log(`  ABS_TOKEN: ${ABS_TOKEN ? "********" : "NOT SET"}`);
console.log(`  MAX_PARALLEL: ${MAX_PARALLEL}`);
console.log(`  CONVERSION_DELAY: ${CONVERSION_DELAY}ms`);
console.log(`  EMBED_METADATA: ${EMBED_METADATA}`);
console.log(`  CONVERSION_MATRIX_STRING: ${CONVERSION_MATRIX_STRING}`);
console.log(`  EXCLUDED_CODECS: ${EXCLUDED_CODECS.join(", ")}`);
console.log(`  WebSocket URL: ${getWebSocketUrl()}`);
console.log(`  API Base URL: ${getApiBaseUrl()}`);
console.log(`  ENCODE_LIBRARY: ${ENCODE_LIBRARY}`);
console.log(`  DRY_RUN: ${DRY_RUN}`);