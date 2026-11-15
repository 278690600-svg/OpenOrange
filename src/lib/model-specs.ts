export interface ModelSpec {
  maxContextSize: number;
  maxOutputTokens: number;
  defaultTemperature: number;
  defaultTopP: number;
  defaultOutputTokens: number;
  defaultContextSize: number;
}

export const DEFAULT_SPEC: ModelSpec = {
  maxContextSize: 16384,
  maxOutputTokens: 8192,
  defaultTemperature: 0.7,
  defaultTopP: 0.9,
  defaultOutputTokens: 4096,
  defaultContextSize: 8192,
};

export function getModelSpec(modelId: string): ModelSpec {
  if (!modelId) return DEFAULT_SPEC;

  // Remove provider prefix if exists, e.g., 'openai::gpt-4o' -> 'gpt-4o'
  const idWithoutProvider = modelId.includes('::')
    ? modelId.split('::')[1]
    : modelId;

  const idLower = idWithoutProvider.toLowerCase();
  const provider = modelId.includes('::') ? modelId.split('::')[0].toLowerCase() : '';

  // Google Gemini models
  if (idLower.includes('gemini-2.5-pro') || idLower.includes('gemini-1.5-pro')) {
    return {
      maxContextSize: 1048576, // Gemini technically supports 2M, but 1M is a very safe UI and system limit
      maxOutputTokens: 8192,
      defaultTemperature: 1.0,
      defaultTopP: 0.95,
      defaultOutputTokens: 8192,
      defaultContextSize: 131072, // 128k recommended context default
    };
  }
  if (idLower.includes('gemini-2.0-flash') || idLower.includes('gemini-1.5-flash') || idLower.includes('gemini-2.5-flash')) {
    return {
      maxContextSize: 1048576,
      maxOutputTokens: 8192,
      defaultTemperature: 1.0,
      defaultTopP: 0.95,
      defaultOutputTokens: 8192,
      defaultContextSize: 131072,
    };
  }
  if (idLower.includes('gemini')) {
    return {
      maxContextSize: 1048576,
      maxOutputTokens: 8192,
      defaultTemperature: 0.7,
      defaultTopP: 0.9,
      defaultOutputTokens: 8192,
      defaultContextSize: 65536,
    };
  }

  // OpenAI models
  if (idLower.includes('gpt-4o-mini')) {
    return {
      maxContextSize: 128000,
      maxOutputTokens: 16384,
      defaultTemperature: 0.7,
      defaultTopP: 1.0,
      defaultOutputTokens: 8192,
      defaultContextSize: 16384,
    };
  }
  if (idLower.includes('gpt-4o')) {
    return {
      maxContextSize: 128000,
      maxOutputTokens: 16384,
      defaultTemperature: 0.7,
      defaultTopP: 1.0,
      defaultOutputTokens: 8192,
      defaultContextSize: 32768,
    };
  }
  if (idLower.includes('gpt-4-turbo') || idLower.includes('gpt-4')) {
    return {
      maxContextSize: 128000,
      maxOutputTokens: 4096,
      defaultTemperature: 0.7,
      defaultTopP: 1.0,
      defaultOutputTokens: 4096,
      defaultContextSize: 16384,
    };
  }
  if (idLower.includes('gpt-3.5-turbo') || idLower.includes('gpt-3.5')) {
    return {
      maxContextSize: 16384,
      maxOutputTokens: 4096,
      defaultTemperature: 0.7,
      defaultTopP: 1.0,
      defaultOutputTokens: 4096,
      defaultContextSize: 8192,
    };
  }
  if (idLower.startsWith('o1') || idLower.startsWith('o3-mini')) {
    return {
      maxContextSize: 200000,
      maxOutputTokens: 65536,
      defaultTemperature: 1.0,
      defaultTopP: 1.0,
      defaultOutputTokens: 32768,
      defaultContextSize: 65536,
    };
  }

  // Anthropic Claude models
  if (idLower.includes('claude-3-5-sonnet') || idLower.includes('claude-sonnet-4') || idLower.includes('claude-3.5-sonnet')) {
    return {
      maxContextSize: 200000,
      maxOutputTokens: 8192,
      defaultTemperature: 0.7,
      defaultTopP: 1.0,
      defaultOutputTokens: 8192,
      defaultContextSize: 32768,
    };
  }
  if (idLower.includes('claude-3-opus') || idLower.includes('claude-opus-4')) {
    return {
      maxContextSize: 200000,
      maxOutputTokens: 4096,
      defaultTemperature: 0.7,
      defaultTopP: 1.0,
      defaultOutputTokens: 4096,
      defaultContextSize: 16384,
    };
  }
  if (idLower.includes('claude-3-haiku') || idLower.includes('claude-haiku')) {
    return {
      maxContextSize: 200000,
      maxOutputTokens: 4096,
      defaultTemperature: 0.7,
      defaultTopP: 1.0,
      defaultOutputTokens: 4096,
      defaultContextSize: 16384,
    };
  }
  if (idLower.includes('claude')) {
    return {
      maxContextSize: 200000,
      maxOutputTokens: 4096,
      defaultTemperature: 0.7,
      defaultTopP: 1.0,
      defaultOutputTokens: 4096,
      defaultContextSize: 16384,
    };
  }

  // DeepSeek models
  if (idLower.includes('deepseek-chat')) {
    return {
      maxContextSize: 128000,
      maxOutputTokens: 8192,
      defaultTemperature: 0.7,
      defaultTopP: 0.9,
      defaultOutputTokens: 8192,
      defaultContextSize: 32768,
    };
  }
  if (idLower.includes('deepseek-reasoner')) {
    return {
      maxContextSize: 128000,
      maxOutputTokens: 8192,
      defaultTemperature: 0.6,
      defaultTopP: 0.95,
      defaultOutputTokens: 8192,
      defaultContextSize: 32768,
    };
  }
  if (idLower.includes('deepseek')) {
    return {
      maxContextSize: 128000,
      maxOutputTokens: 8192,
      defaultTemperature: 0.7,
      defaultTopP: 0.9,
      defaultOutputTokens: 8192,
      defaultContextSize: 32768,
    };
  }
  // Zhipu GLM models
  if (idLower.includes('glm') || provider === 'zhipu') {
    // GLM-Z1 and GLM-5.2 support larger output
    if (idLower.includes('glm-z1') || idLower.includes('glm-5')) {
      return {
        maxContextSize: 128000,
        maxOutputTokens: 16384,
        defaultTemperature: 0.7,
        defaultTopP: 0.9,
        defaultOutputTokens: 8192,
        defaultContextSize: 32768,
      };
    }
    // GLM-4-Plus supports longer context
    if (idLower.includes('glm-4-plus')) {
      return {
        maxContextSize: 128000,
        maxOutputTokens: 8192,
        defaultTemperature: 0.7,
        defaultTopP: 0.9,
        defaultOutputTokens: 4096,
        defaultContextSize: 32768,
      };
    }
    // Default GLM-4 family
    return {
      maxContextSize: 128000,
      maxOutputTokens: 4096,
      defaultTemperature: 0.7,
      defaultTopP: 0.9,
      defaultOutputTokens: 4096,
      defaultContextSize: 32768,
    };
  }

  // MiniMax models
  if (idLower.includes('minimax') || idLower.includes('abab') || provider === 'minimax') {
    return {
      maxContextSize: 128000,
      maxOutputTokens: 4096,
      defaultTemperature: 0.7,
      defaultTopP: 0.9,
      defaultOutputTokens: 4096,
      defaultContextSize: 32768,
    };
  }

  // Moonshot Kimi models
  if (idLower.includes('moonshot') || idLower.includes('kimi')) {
    let size = 128000;
    if (idLower.includes('200k')) size = 200000;
    if (idLower.includes('32k')) size = 32768;
    if (idLower.includes('8k')) size = 8192;
    return {
      maxContextSize: size,
      maxOutputTokens: 4096,
      defaultTemperature: 0.7,
      defaultTopP: 0.9,
      defaultOutputTokens: 4096,
      defaultContextSize: size > 32768 ? 32768 : size,
    };
  }

  // Volcengine Doubao models
  if (idLower.includes('doubao') || provider === 'volcengine') {
    let size = 128000;
    if (idLower.includes('32k')) size = 32768;
    if (idLower.includes('256k')) size = 256000;
    return {
      maxContextSize: size,
      maxOutputTokens: 4096,
      defaultTemperature: 0.7,
      defaultTopP: 0.9,
      defaultOutputTokens: 4096,
      defaultContextSize: size > 32768 ? 32768 : size,
    };
  }

  // Alibaba Qwen models
  if (idLower.includes('qwen')) {
    let size = 128000;
    if (idLower.includes('qwen-long')) size = 1048576; // Qwen-long supports 1M
    return {
      maxContextSize: size,
      maxOutputTokens: 4096,
      defaultTemperature: 0.7,
      defaultTopP: 0.9,
      defaultOutputTokens: 4096,
      defaultContextSize: size > 32768 ? 32768 : size,
    };
  }

  // Llama and Mistral
  if (idLower.includes('llama3') || idLower.includes('llama-3')) {
    return {
      maxContextSize: 8192,
      maxOutputTokens: 4096,
      defaultTemperature: 0.7,
      defaultTopP: 0.9,
      defaultOutputTokens: 4096,
      defaultContextSize: 8192,
    };
  }
  if (idLower.includes('mixtral') || idLower.includes('mistral')) {
    return {
      maxContextSize: 32768,
      maxOutputTokens: 8192,
      defaultTemperature: 0.7,
      defaultTopP: 0.9,
      defaultOutputTokens: 4096,
      defaultContextSize: 16384,
    };
  }

  // Provider fallbacks
  if (provider === 'local-gguf' || provider === 'ollama' || provider === 'lmstudio') {
    return {
      maxContextSize: 32768,
      maxOutputTokens: 8192,
      defaultTemperature: 0.7,
      defaultTopP: 0.9,
      defaultOutputTokens: 4096,
      defaultContextSize: 8192,
    };
  }

  return DEFAULT_SPEC;
}

export function adjustModelParams(
  modelId: string,
  params: {
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    contextSize?: number;
  }
) {
  const spec = getModelSpec(modelId);

  // Temperature: if 0 or undefined, do not restrict (undefined, let model decide)
  let temperature = params.temperature;
  if (temperature === 0 || typeof temperature !== 'number') {
    temperature = undefined;
  } else {
    temperature = Math.max(0.01, Math.min(2.0, temperature));
  }

  // Top P: if 0 or undefined, do not restrict (undefined, let model decide)
  let topP = params.topP;
  if (topP === 0 || typeof topP !== 'number') {
    topP = undefined;
  } else {
    topP = Math.max(0.01, Math.min(1.0, topP));
  }

  // If maxTokens is explicitly set to 0 or not specified, it means "no limit" (unlimited)
  let maxTokens = params.maxTokens;
  if (maxTokens === 0 || typeof maxTokens !== 'number') {
    maxTokens = undefined;
  } else {
    maxTokens = Math.min(maxTokens, spec.maxOutputTokens);
  }

  // If contextSize is set to 0 or not specified, it means "no limit" (use model's max allowed context)
  let contextSize = params.contextSize;
  if (contextSize === 0 || typeof contextSize !== 'number') {
    contextSize = spec.maxContextSize;
  } else {
    contextSize = Math.min(contextSize, spec.maxContextSize);
  }

  return {
    temperature,
    topP,
    maxTokens,
    contextSize,
  };
}
