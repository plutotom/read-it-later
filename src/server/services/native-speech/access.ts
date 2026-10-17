/** Replace this policy and migrate artifact ownership before enabling public accounts. */
export interface SpeechAccessPolicy {
  authorize(
    request: Request,
    operation: "catalog" | "generate" | "read" | "delete",
    artifactID?: string,
  ): Promise<{ namespace: string }>;
}
export const speechAccess: SpeechAccessPolicy = {
  async authorize() {
    return { namespace: "prototype" };
  },
};
