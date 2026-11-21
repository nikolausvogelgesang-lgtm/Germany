// Only these machine-generated fields cross a diagnostic boundary. Provider
// response bodies, request headers, prompts and exception messages never do.
export class ProviderFailure extends Error {
  constructor(stage,category,httpStatus=null) {
    super(`${stage}:${category}`);
    Object.assign(this,{stage,category,httpStatus});
  }
  diagnostic() { return {stage:this.stage,category:this.category,httpStatus:this.httpStatus}; }
}
export async function transport(stage, send) {
  try { return await send(); }
  catch (e) {
    if (e instanceof ProviderFailure) throw e;
    const timeout=['TimeoutError','AbortError'].includes(e?.name)||['ETIMEDOUT','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT'].includes(e?.cause?.code??e?.code);
    throw new ProviderFailure(stage,timeout?'timeout':'network');
  }
}
export function requireOK(stage,res) {
  if (res.ok) return;
  const code=res.status;
  const category=({400:'bad_request',401:'authentication',403:'permission',404:'not_found',408:'timeout',413:'request_size',422:'invalid_request',429:'rate_limit',504:'timeout'})[code] ??
    (code>=500?'provider_server_error':code>=400?'request_rejected':'unexpected_status');
  throw new ProviderFailure(stage,category,Number.isInteger(code)?code:null);
}
export function requireJson(stage,res) {
  if(!/^application\/(?:[a-z0-9.+-]+\+)?json(?:\s*;|$)/i.test(res.headers?.get('content-type')??'')) throw new ProviderFailure(stage,'unexpected_content_type');
}
export async function structuredOutput(stage,key,payload,onUsage) {
  const res=await transport(stage,()=>fetch('https://api.openai.com/v1/responses',{
    method:'POST',redirect:'error',signal:AbortSignal.timeout(45_000),headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},
    body:JSON.stringify({store:false,...payload}),
  }));
  requireOK(stage,res);
  requireJson(stage,res);
  const body=await transport(stage,async()=>{
    try { return await res.json(); } catch(e) { if(e instanceof SyntaxError) throw new ProviderFailure(stage,'invalid_response_json'); throw e; }
  });
  onUsage(stage,body?.usage);
  if(body?.status==='incomplete') throw new ProviderFailure(stage,body.incomplete_details?.reason==='max_output_tokens'?'output_token_limit':'incomplete_output');
  if(body?.status==='failed') throw new ProviderFailure(stage,'provider_failed');
  if(body?.status!=='completed' || body?.error || (Array.isArray(body.output) && body.output.some(i=>i?.status && i.status!=='completed')))
    throw new ProviderFailure(stage,'incomplete_output');
  const parts=Array.isArray(body?.output)?body.output.flatMap(i=>i?.content??[]):[];
  if(parts.some(p=>p?.type==='refusal')) throw new ProviderFailure(stage,'refusal');
  if(parts.filter(p=>p?.type==='output_text').length>1) throw new ProviderFailure(stage,'ambiguous_output');
  const text=parts.find(p=>p?.type==='output_text')?.text;
  if(typeof text!=='string'||!text) throw new ProviderFailure(stage,'missing_output');
  try { return JSON.parse(text); } catch { throw new ProviderFailure(stage,'invalid_output_json'); }
}
