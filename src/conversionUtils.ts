/**
 * Represents the output profile of a conversion.
 */
export interface ConversionProfile {
    codec: string;
    bitrate: string;
    channels: string;
}

/**
 * Represents the parsed conversion matrix.
 * The key is the condition, the value is the {@link ConversionProfile}.
 */
export type ConversionMatrix = Map<string, ConversionProfile>;

/**
 * Parses the conversion matrix string and returns a map of conditions
 * to their corresponding codec, bitrate, and channel settings.
 * @param matrixStr - The conversion matrix string.
 *   Format: "condCodec|fromBitrate|toBitrate|fromChannels|toChannels=outCodec|outBitrate|outChannels,..."
 *   'copy' as outCodec means no conversion will take place.
 * @returns A map where keys are conditions and values are conversion profiles.
 */
export function parseConversionMatrix(matrixStr: string): ConversionMatrix {
    const map: ConversionMatrix = new Map();
    if (!matrixStr) return map;

    const rules = matrixStr.split(",");

    for (const rule of rules) {
        const [condition, result] = rule.split("=");
        if (condition && result) {
            const [codec, bitrate, channels] = result.split("|");
            map.set(condition.trim(), {
                codec: codec.trim(),
                bitrate: bitrate.trim(),
                channels: channels.trim(),
            });
        } else if (condition && !result) {
            const [codec, bitrate, channels] = condition.split("|");
            if (codec && bitrate && channels) {
                map.set("0|0|0|0|0", {
                    codec: codec.trim(),
                    bitrate: bitrate.trim(),
                    channels: channels.trim(),
                });
            }
        }
    }
    return map;
}

/**
 * Finds the best match for the given codec, bitrate, and channels
 * based on the conversion matrix.
 * @param matrix - The parsed conversion matrix map.
 * @param inputCodec - The input codec (e.g., "mp3", "aac").
 * @param inputBitrate - The input bitrate in bps (e.g., 128000).
 * @param inputChannels - The number of input channels (e.g., 2).
 * @returns The matching {@link ConversionProfile} or `null` if no rule matches and no fallback is defined.
 *          If the outCodec is 'copy', inputCodec, inputBitrate and inputChannels are used for the result (adjusted to string format).
 */
export function findConversion(
    matrix: ConversionMatrix,
    inputCodec: string,
    inputBitrate: number,
    inputChannels: number,
): ConversionProfile | null {
    for (const [condition, resultProfile] of matrix.entries()) {
        const [
            condCodec,
            condFromBitrate,
            condToBitrate,
            condFromChannels,
            condToChannels,
        ] = condition.split("|");

        if (
            (condCodec.toLowerCase() === inputCodec.toLowerCase() ||
                condCodec === "0") &&
            (condFromBitrate === "0" || inputBitrate >= parseInt(condFromBitrate)) &&
            (condToBitrate === "0" || inputBitrate <= parseInt(condToBitrate)) &&
            (condFromChannels === "0" || inputChannels >= parseInt(condFromChannels)) &&
            (condToChannels === "0" || inputChannels <= parseInt(condToChannels))
        ) {
            if (resultProfile.codec.toLowerCase() === "copy") {
                return {
                    codec: inputCodec,
                    bitrate: inputBitrate.toString(),
                    channels: inputChannels.toString(),
                };
            }
            return resultProfile;
        }
    }

    const fallbackProfile = matrix.get("0|0|0|0|0");
    if (fallbackProfile) {
        if (fallbackProfile.codec.toLowerCase() === "copy") {
            return {
                codec: inputCodec,
                bitrate: inputBitrate.toString(),
                channels: inputChannels.toString(),
            };
        }
        return fallbackProfile;
    }

    return null;
}
