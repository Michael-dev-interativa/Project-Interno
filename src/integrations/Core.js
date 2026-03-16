// Shim para compatibilidade com imports antigos: re-exportar integrações do cliente API
import { UploadFile, Core as BaseCore, InvokeLLM, SendEmail, SendSMS, GenerateImage, ExtractDataFromUploadedFile } from '@/api/integrations';

export { UploadFile, BaseCore as Core, InvokeLLM, SendEmail, SendSMS, GenerateImage, ExtractDataFromUploadedFile };

// Fallback export for default import patterns
export default { UploadFile, Core: BaseCore };
