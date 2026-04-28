import {
  OpenAICompatibleChatLanguageModel,
  OpenAICompatibleCompletionLanguageModel,
  OpenAICompatibleEmbeddingModel,
  OpenAICompatibleImageModel,
} from '@ai-sdk/openai-compatible';
import {
  OpenAIResponsesLanguageModel,
  OpenAITranscriptionModel,
  OpenAISpeechModel,
} from '@ai-sdk/openai/internal';
import { AnthropicMessagesLanguageModel } from '@ai-sdk/anthropic/internal';
import { GoogleGenerativeAILanguageModel } from '@ai-sdk/google/internal';
import {
  EmbeddingModelV3,
  LanguageModelV3,
  ProviderV3,
  ImageModelV3,
  TranscriptionModelV3,
  SpeechModelV3,
  TranscriptionModelV3CallOptions,
} from '@ai-sdk/provider';
import { FetchFunction, loadApiKey } from '@ai-sdk/provider-utils';
import { aihubmixTools } from './aihubmix-tools';

// OpenAI Provider 设置类型
interface OpenAIProviderSettings {
  [key: string]: unknown;
}


export interface AihubmixProvider extends ProviderV3 {
  (deploymentId: string, settings?: OpenAIProviderSettings): LanguageModelV3;

  readonly specificationVersion: 'v3';

  languageModel(
    deploymentId: string,
    settings?: OpenAIProviderSettings,
  ): LanguageModelV3;

  chat(
    deploymentId: string,
    settings?: OpenAIProviderSettings,
  ): LanguageModelV3;

  responses(deploymentId: string): LanguageModelV3;

  completion(
    deploymentId: string,
    settings?: OpenAIProviderSettings,
  ): LanguageModelV3;

  embedding(
    deploymentId: string,
    settings?: OpenAIProviderSettings,
  ): EmbeddingModelV3;

  embeddingModel(modelId: string): EmbeddingModelV3;

  image(deploymentId: string, settings?: OpenAIProviderSettings): ImageModelV3;

  imageModel(modelId: string): ImageModelV3;

  textEmbedding(
    deploymentId: string,
    settings?: OpenAIProviderSettings,
  ): EmbeddingModelV3;

  textEmbeddingModel(
    deploymentId: string,
    settings?: OpenAIProviderSettings,
  ): EmbeddingModelV3;

  transcription(deploymentId: string): TranscriptionModelV3;

  speech(deploymentId: string): SpeechModelV3;

  speechModel(deploymentId: string): SpeechModelV3;

  tools: typeof aihubmixTools;
}
export interface AihubmixProviderSettings {
  apiKey?: string;
  fetch?: FetchFunction;
  compatibility?: 'strict' | 'compatible';
}

class AihubmixTranscriptionModel extends OpenAITranscriptionModel {
  async doGenerate(options: TranscriptionModelV3CallOptions) {
    // 根据MIME类型设置正确的文件扩展名
    if (options.mediaType) {
      const mimeTypeMap: Record<string, string> = {
        'audio/mpeg': 'mp3',
        'audio/mp3': 'mp3',
        'audio/wav': 'wav',
        'audio/flac': 'flac',
        'audio/m4a': 'm4a',
        'audio/mp4': 'mp4',
        'audio/ogg': 'ogg',
        'audio/webm': 'webm',
        'audio/oga': 'oga',
        'audio/mpga': 'mpga',
      };
      
      const extension = mimeTypeMap[options.mediaType];
      if (extension) {
        // 重写getArgs方法来设置正确的文件名
        const originalGetArgs = (this as any).getArgs;
        (this as any).getArgs = async function(args: any) {
          const result = await originalGetArgs.call(this, args);
          if (result.formData) {
            // 找到file字段并修改文件名
            const fileEntry = result.formData.get('file');
            if (fileEntry && typeof fileEntry === 'object' && 'name' in fileEntry) {
              // 创建新的 File 对象，设置正确的文件名
              try {
                const newFile = new File([fileEntry], `audio.${extension}`, { 
                  type: options.mediaType 
                });
                result.formData.set('file', newFile);
              } catch (error) {
                console.log('Failed to create new File object:', error);
                // 如果创建新 File 对象失败，尝试其他方法
                // 在 Node.js 环境中，可能需要使用 Buffer 或其他方式
                if (fileEntry && typeof fileEntry === 'object' && 'arrayBuffer' in fileEntry) {
                  try {
                    const arrayBuffer = await (fileEntry as any).arrayBuffer();
                    const newFile = new File([arrayBuffer], `audio.${extension}`, { 
                      type: options.mediaType 
                    });
                    result.formData.set('file', newFile);
                    console.log('Created new file from arrayBuffer with name:', `audio.${extension}`);
                  } catch (bufferError) {
                    console.log('Failed to create file from arrayBuffer:', bufferError);
                  }
                }
              }
            }
          }
          return result;
        };
      }
    }
    
    return super.doGenerate(options);
  }
}

// 修复空工具时的 tool_choice 问题
function transformRequestBody(body: Record<string, any>): Record<string, any> {
  if (body.tools && Array.isArray(body.tools) && body.tools.length === 0 && body.tool_choice) {
    const { tool_choice, ...rest } = body;
    return rest;
  }
  return body;
}export function createAihubmix(
  options: AihubmixProviderSettings = {},
): AihubmixProvider {
  const getHeaders = () => ({
    Authorization: `Bearer ${loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: 'AIHUBMIX_API_KEY',
      description: 'Aihubmix',
    })}`,
    'APP-Code': 'WHVL9885',
    'Content-Type': 'application/json',
  });

  const getTranscriptionHeaders = () => ({
    Authorization: `Bearer ${loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: 'AIHUBMIX_API_KEY',
      description: 'Aihubmix',
    })}`,
    'APP-Code': 'WHVL9885',
  });

  const url = ({ path, modelId }: { path: string; modelId: string }) => {
    const baseURL = 'https://aihubmix.com/v1';
    return `${baseURL}${path}`;
  };

  const createChatModel = (
    deploymentName: string,
    settings: OpenAIProviderSettings = {},
  ) => {
    const headers = getHeaders();
    if (deploymentName.startsWith('claude-')) {
      const { Authorization, ...restHeaders } = headers;
      return new AnthropicMessagesLanguageModel(deploymentName, {
        provider: 'aihubmix.chat',
        baseURL: url({ path: '', modelId: deploymentName }),
        headers: {
          ...restHeaders,
          'x-api-key': Authorization.split(' ')[1],
        },
        supportedUrls: () => ({
          'image/*': [/^https?:\/\/.*$/],
        }),
      });
    }
    if (
      (deploymentName.startsWith('gemini') ||
        deploymentName.startsWith('imagen')) &&
      !deploymentName.endsWith('-nothink') &&
      !deploymentName.endsWith('-search')
    ) {
      const { Authorization, ...restHeaders } = headers;
      return new GoogleGenerativeAILanguageModel(
        deploymentName,
        {
          provider: 'aihubmix.chat',
          baseURL: 'https://aihubmix.com/gemini/v1beta',
          headers: {
            ...restHeaders,
            'x-goog-api-key': Authorization.split(' ')[1],
          },
          generateId: () => `aihubmix-${Date.now()}`,
          supportedUrls: () => ({}),
        },
      );
    }

    return new OpenAICompatibleChatLanguageModel(deploymentName, {
      provider: 'aihubmix.chat',
      url,
      headers: getHeaders,
      fetch: options.fetch,
      includeUsage: true,
      supportsStructuredOutputs: true,
      transformRequestBody,
    });
  };

  const createCompletionModel = (
    modelId: string,
    settings: any = {},
  ) =>
    new OpenAICompatibleCompletionLanguageModel(modelId, {
      provider: 'aihubmix.completion',
      url,
      headers: getHeaders,
      fetch: options.fetch,
      includeUsage: true,
    });

  const createEmbeddingModel = (
    modelId: string,
    settings: any = {},
  ) => {
    return new OpenAICompatibleEmbeddingModel(modelId, {
      provider: 'aihubmix.embeddings',
      url,
      headers: getHeaders,
      fetch: options.fetch,
    });
  };

  const createResponsesModel = (modelId: string) =>
    new OpenAIResponsesLanguageModel(modelId, {
      provider: 'aihubmix.responses',
      url,
      headers: getHeaders,
    });

  const createImageModel = (
    modelId: string,
    settings: any = {},
  ) => {
    return new OpenAICompatibleImageModel(modelId, {
      provider: 'aihubmix.image',
      url,
      headers: getHeaders,
      fetch: options.fetch,
    });
  };

  const createTranscriptionModel = (modelId: string) =>
    new AihubmixTranscriptionModel(modelId, {
      provider: 'aihubmix.transcription',
      url,
      headers: getTranscriptionHeaders,
      fetch: options.fetch,
    });
  const createSpeechModel = (modelId: string) =>
    new OpenAISpeechModel(modelId, {
      provider: 'aihubmix.speech',
      url,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const providerFn = function (
    deploymentId: string,
    settings?: OpenAIProviderSettings,
  ) {
    if (new.target) {
      throw new Error(
        'The Aihubmix model function cannot be called with the new keyword.',
      );
    }

    return createChatModel(deploymentId, settings);
  };

  // 创建带有所有必需属性的 provider 对象
  const provider = Object.assign(providerFn, {
    specificationVersion: 'v3' as const,
    languageModel: createChatModel,
    chat: createChatModel,
    completion: createCompletionModel,
    responses: createResponsesModel,
    embedding: createEmbeddingModel,
    embeddingModel: createEmbeddingModel,
    textEmbedding: createEmbeddingModel,
    textEmbeddingModel: createEmbeddingModel,
    image: createImageModel,
    imageModel: createImageModel,
    transcription: createTranscriptionModel,
    transcriptionModel: createTranscriptionModel,
    speech: createSpeechModel,
    speechModel: createSpeechModel,
    tools: aihubmixTools,
  });

  return provider as AihubmixProvider;
}

export const aihubmix = createAihubmix();
