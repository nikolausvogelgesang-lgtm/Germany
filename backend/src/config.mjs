// Shared by the server and private diagnostics. Never import from frontend.
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const rootEnv=fileURLToPath(new URL('../../.env',import.meta.url));
export function loadConfig() {if(existsSync(rootEnv)) process.loadEnvFile(rootEnv);}
export const openAIModel=(role,env=process.env)=>({
  writer:env.OPENAI_MODEL||'gpt-5.4',verifier:env.OPENAI_VERIFIER_MODEL||'gpt-5.4',
  repair:env.OPENAI_REPAIR_MODEL||'gpt-5.4',
})[role];
export const voiceConfig=(env=process.env)=>({voice:env.ELEVENLABS_VOICE_ID||'JBFqnCBsd6RMkjVDRZzb',model:env.ELEVENLABS_MODEL||'eleven_flash_v2_5'});
