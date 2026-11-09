import { analyzeDemo, DemoInputError } from "../../../lib/traceboard/index.ts";
import {
  ApiError,
  analyzeWithGroq,
  errorResponse,
  getDefaultModel,
  getServerApiKey,
  jsonResponse,
  readJsonBody,
  validateRequest,
} from "../../../lib/groq.ts";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) {
      throw new ApiError(
        "INVALID_ORIGIN",
        "Send analysis requests from this application.",
        403,
      );
    }
    const { input, apiKey } = validateRequest(await readJsonBody(request));
    if (input.mode === "groq" && !input.model)
      input.model = await getDefaultModel();
    const result =
      input.mode === "demo"
        ? analyzeDemo(input)
        : await analyzeWithGroq(input, {
            apiKey: apiKey || (await getServerApiKey()),
          });
    return jsonResponse({ result });
  } catch (error) {
    if (error instanceof DemoInputError) {
      return errorResponse(
        new ApiError("DEMO_SAMPLE_REQUIRED", error.message, 400),
      );
    }
    return errorResponse(error);
  }
}
