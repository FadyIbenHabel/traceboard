import handler from "vinext/server/fetch-handler";

const worker = {
  fetch(request: Request, env: Cloudflare.Env, context: ExecutionContext) {
    return handler.fetch(request, env, context);
  },
};

export default worker;
