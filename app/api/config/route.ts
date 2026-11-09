import {
  MODELS,
  getDefaultModel,
  getServerApiKey,
  jsonResponse,
} from "../../../lib/groq.ts";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return jsonResponse({
    configured: Boolean(await getServerApiKey()),
    provider: "groq",
    defaultModel: await getDefaultModel(),
    models: MODELS,
    demoAvailable: true,
  });
}
