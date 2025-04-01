import { createLogger, transports } from "winston";

import { stdout, websocket } from "../winston";

export { Logger, LoggerOptions, transports } from "winston";
export { stdout, websocket };

export default createLogger({
  transports: [new transports.Console()]
});
