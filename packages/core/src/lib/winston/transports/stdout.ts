import { format, transports } from "winston";

const { combine, timestamp, printf, colorize } = format;

const neonGreen = "\x1b[38;2;0;255;0m"; // neon green
const brightYellow = "\x1b[38;2;255;255;0m"; // bright yellow
const brightGreen = "\x1b[38;2;0;255;128m"; // bright green
const brightCyan = "\x1b[38;2;0;255;255m"; // bright cyan
const lightMagenta = "\x1b[38;2;255;153;255m"; // light magenta
const white = "\x1b[38;2;255;255;255m"; // white
const reset = "\x1b[0m";

const color = (text: string, color: string) => `${color}${text}${reset}`;

/**
 * StdoutTransport is a transport for Winston that logs to the console in MAIAR's predefined format with contrasting colors.
 * It can be used in the MAIAR runtime to display logs in the console in MAIAR's predefined format with contrasting colors.
 * Format: $MAIAR | timestamp | level | scope | message | metadata
 */
export const stdout = new transports.Console({
  format: combine(
    format((info) => {
      info.level = info.level.toUpperCase();
      return info;
    })(),
    colorize(),
    timestamp({
      format: () => new Date().toISOString()
    }),
    printf(({ level, message, timestamp, scope, ...metadata }) => {
      const _scope = scope ? color(scope as string, brightGreen) : "unknown";
      const meta = metadata
        ? `${Object.entries(metadata)
            .map(([key, value]) => {
              if (typeof value === "object" && value !== null) {
                return `${color(key, brightCyan)}=${color(
                  JSON.stringify(value),
                  white
                )}`;
              }
              return `${color(key, brightCyan)}=${color(value as string, white)}`;
            })
            .join(" ")}`
        : "";

      const log = [
        color("$MAIAR", neonGreen),
        color(timestamp as string, brightYellow),
        level,
        _scope,
        color(message as string, lightMagenta)
      ];
      if (meta) log.push(meta);
      return log.join(" | ");
    })
  )
});
