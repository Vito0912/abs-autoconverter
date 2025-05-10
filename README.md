# ABS Autoconverter

This tool converts your files in Audiobookshelf (ABS) according to defined rules. For examples of these rules, please refer to the [examples](#examples) section.

Requirements:
- WebSocket support
- A stable connection is required. If the WebSocket connection is interrupted, the script may encounter errors.
- It is highly recommended to back up your files before running this script. The author is not responsible for any data loss. Files *should* be backed up automatically by Audiobookshelf, but an extra backup is a good precaution.

## Environment

> [!IMPORTANT]
> It is recommended to create a separate user for this script, as the WebSocket will be connected to the server 24/7 (unless `DRY_RUN` is set to `true`).

> [!NOTE]
> Refer to [Examples for Matrix](#examples-for-matrix) to avoid creating conversion loops.

| VAR                 | Description                                                                                                                                          | required | default (if) |
|---------------------|------------------------------------------------------------------------------------------------------------------------------------------------------|----------|--------------|
| `ABS_HOST`          | The host address of your Audiobookshelf server (e.g., "localhost:13378" or "abs.example.com"). Do include the protocol prefix (http:// or https://). | Yes      |              |
| `ABS_TOKEN`         | Your authentication token for the Audiobookshelf API.                                                                                                | Yes      |              |
| `MAX_PARALLEL`      | The maximum number of parallel conversion tasks. This value should ideally not exceed the number of available CPU cores minus one.                   | No       | `1`          |
| `CONVERSION_DELAY`  | The delay in milliseconds before a conversion starts after an item is added to the queue.                                                            | No       | `15000`      |
| `EMBED_METADATA`    | Specifies whether metadata should be embedded into the converted files. Set to "true" to enable.                                                     | No       | `false`      |
| `CONVERSION_MATRIX` | The conversion matrix string that defines the rules for audio conversion. See [Examples for Matrix](#examples-for-matrix) for more details.          | Yes      |              |
| `ENCODE_LIBRARY`    | Specifies whether to encode the entire library upon startup. This is useful for initial runs. Set to "true" to enable.                               | No       | `false`      |
| `DRY_RUN`           | If set to "true" or "1", the program will exit after processing the current queue (no new items will be watched). Useful for testing.                | No       | `false`      |
| `EXCLUDED_CODECS`   | A comma-separated list of audio codecs to be excluded from conversion. Codec comparisons are case-sensitive (e.g., "aac,mp3").                       | No       | `"opus"`     |

### Recommended ENV

```env
ABS_HOST=<your_abs_host>
ABS_TOKEN=<your_abs_token>
CONVERSION_MATRIX=0|1|48000|1|1=opus|24000|1,0|1|48000|2|2=opus|24000|2,0|48000|72000|1|1=opus|48000|1,0|48000|72000|2|2=opus|48000|2,0|72000|256000|1|1=opus|64000|1,0|72000|256000|2|2=opus|64000|2,0|0|0|0|0=opus|64000|2
EXCLUDED_CODECS=opus
CONVERSION_DELAY=60000
MAX_PARALLEL=4
EMBED_METADATA=true
# This should typically be disabled after the initial library scan and conversion.
ENCODE_LIBRARY=true
DRY_RUN=false
```

## Examples for Matrix

> [!NOTE]
> Ensure you only convert files to formats supported by Audiobookshelf.
> It is crucial to set `EXCLUDED_CODECS` to include all target codecs you are encoding *to*. While you can define rules to encode to multiple codecs (see examples below), all these target codecs *must* be listed in the `EXCLUDED_CODECS` variable to prevent re-encoding loops.

The format for `CONVERSION_MATRIX` is as follows:

```
<codec>|<fromBitrate>|<toBitrate>|<fromChannels>|<toChannels>=<codec>|<bitrate>|<channels>,<codec>|<bitrate>|<channels>
```

A `0` in the matrix acts as a wildcard, matching any value. Codec names are case-sensitive and should generally be in lowercase.

The following string:
`0|1|48000|1|1=opus|24000|1,0|1|48000|2|2=opus|24000|2,0|48000|72000|1|1=opus|48000|1,0|48000|72000|2|2=opus|48000|2,0|72000|256000|1|1=opus|64000|1,0|72000|256000|2|2=opus|64000|2,0|0|0|0|0=opus|64000|2`
This string defines the following conversion rules:
- Any codec with 1 audio channel and a bitrate between 1 and 48000 bps will be converted to `opus` at 24000 bps with 1 audio channel.
- Any codec with 2 audio channels and a bitrate between 1 and 48000 bps will be converted to `opus` at 24000 bps with 2 audio channels.
- Any codec with 1 audio channel and a bitrate between 48000 and 72000 bps will be converted to `opus` at 48000 bps with 1 audio channel.
- Any codec with 2 audio channels and a bitrate between 48000 and 72000 bps will be converted to `opus` at 48000 bps with 2 audio channels.
- Any codec with 1 audio channel and a bitrate between 72000 and 256000 bps will be converted to `opus` at 64000 bps with 1 audio channel.
- Any codec with 2 audio channels and a bitrate between 72000 and 256000 bps will be converted to `opus` at 64000 bps with 2 audio channels.
- Any codec with any bitrate and any number of audio channels will be converted to `opus` at 64000 bps with 2 audio channels.

A conversion will only occur if the source file's codec is *not* in the `EXCLUDED_CODECS` list and if a matching rule for the source codec, bitrate, and channel combination is found in the `CONVERSION_MATRIX`.


### Dry Run

> [!IMPORTANT]
> When using Dry Run, do NOT configure any restart mechanism that automatically restarts the script. This will cause the script to run indefinitely and never exit.
> During each Dry Run, the script fetches every item from the Audiobookshelf API, which can take a long time for large libraries. Avoid running it too frequently.
> If every item is already in the correct format, the script will exit after processing the current queue. If any items are not in the correct format, the script will continue to run until all items are processed.