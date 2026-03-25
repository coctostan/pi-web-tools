declare module "turndown" {
  class TurndownService {
    constructor(options?: Record<string, unknown>);
    turndown(html: string): string;
  }
  export default TurndownService;
}
