import { SocketClient } from "./socketClient";

/**
 * Main function of the application.
 * Initializes and starts the SocketClient.
 */
async function main() {
    console.log("Starting Audiobookshelf Encoding Companion...");

    const client = new SocketClient();
    client.connect();

    process.on("SIGINT", () => {
        console.log("\nCaught interrupt signal (Ctrl+C).");
        client.shutdown();
        setTimeout(() => {
            console.log("Exiting application.");
            process.exit(0);
        }, 1000);
    });

    process.on("SIGTERM", () => {
        console.log("\nCaught SIGTERM signal.");
        client.shutdown();
        setTimeout(() => {
            console.log("Exiting application due to SIGTERM.");
            process.exit(0);
        }, 1000);
    });
}

main().catch((error) => {
    console.error("Unhandled error in main application:", error);
    process.exit(1);
});
