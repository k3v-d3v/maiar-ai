import { Plugin, PluginResult } from "@maiar-ai/core";

export class TimePlugin extends Plugin {
  constructor() {
    super({
      id: "plugin-time",
      name: "Time",
      description: "Provides current time information",
      requiredCapabilities: []
    });

    this.executors = [
      {
        name: "get_current_time",
        description: "Gets the current localized date and time",
        fn: this.getCurrentTime.bind(this)
      }
    ];
  }

  private async getCurrentTime(): Promise<PluginResult> {
    const formattedTime = new Date().toLocaleString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      timeZoneName: "short"
    });

    return {
      success: true,
      data: {
        currentTime: formattedTime,
        helpfulInstruction: "This is the current time in the system timezone"
      }
    };
  }

  public async init(): Promise<void> {}

  public async shutdown(): Promise<void> {}
}
