import { ProviderAdapter, NormalizedResponse, RequestContext } from '@vectrion/types';
import { VectrionProviderError } from '@vectrion/shared';
import { v4 as uuidv4 } from 'uuid';

export class MultimodalGoogleProviderAdapter implements ProviderAdapter {
  readonly providerId = 'google';
  
  readonly capabilities: Record<string, any> = {
    'gemini-2.5-flash': {
      supportsStructuredOutputs: true,
      supportsStreaming: true,
      maxContextTokens: 1048576,
    },
    'gemini-2.5-flash-lite': {
      supportsStructuredOutputs: true,
      supportsStreaming: true,
      maxContextTokens: 1048576,
    },
    'gemini-2.0-flash': {
      supportsStructuredOutputs: true,
      supportsStreaming: true,
      maxContextTokens: 1048576,
    },
    'gemini-2.0-flash-lite': {
      supportsStructuredOutputs: true,
      supportsStreaming: true,
      maxContextTokens: 1048576,
    },
    'gemini-flash-latest': {
      supportsStructuredOutputs: true,
      supportsStreaming: true,
      maxContextTokens: 1048576,
    },
  };

  private readonly apiKey: string;

  constructor(config: { apiKey: string }) {
    this.apiKey = config.apiKey || process.env.GEMINI_API_KEY || '';
  }

  async initialize() {
    if (!this.apiKey) {
      throw new VectrionProviderError(
        'Google API Key is not set. Please provide it in constructor or set GEMINI_API_KEY env var.',
        this.providerId,
      );
    }
  }

  async execute(ctx: RequestContext, options?: any): Promise<NormalizedResponse> {
    await this.initialize();
    
    let model = ctx.request.model || 'gemini-2.5-flash';
    if (model === 'auto') {
      model = 'gemini-2.5-flash';
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;
    
    const generationConfig: any = {};
    if (ctx.request.temperature !== undefined) {
      generationConfig.temperature = ctx.request.temperature;
    }
    if (ctx.request.maxTokens !== undefined) {
      generationConfig.maxOutputTokens = ctx.request.maxTokens;
    }
    if (ctx.request.schema) {
      generationConfig.responseMimeType = 'application/json';
    }

    // Parse the prompt to extract `<file mime="..." data="..."/>` tags
    const prompt = ctx.request.prompt || '';
    const parts: any[] = [];
    const fileRegex = /<file mime="([^"]+)" data="([^"]+)"\/>/g;
    let lastIndex = 0;
    let match;

    while ((match = fileRegex.exec(prompt)) !== null) {
      const textBefore = prompt.substring(lastIndex, match.index);
      if (textBefore.trim()) {
        parts.push({ text: textBefore });
      }
      parts.push({
        inlineData: {
          mimeType: match[1],
          data: match[2],
        },
      });
      lastIndex = fileRegex.lastIndex;
    }

    const textAfter = prompt.substring(lastIndex);
    if (textAfter.trim() || parts.length === 0) {
      parts.push({ text: textAfter || prompt });
    }

    const payload = {
      contents: [
        {
          parts: parts,
        },
      ],
      generationConfig,
    };

    const startTime = Date.now();
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: options?.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP Error ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const usageMetadata = data.usageMetadata || {};
      const promptTokens = usageMetadata.promptTokenCount || 0;
      const completionTokens = usageMetadata.candidatesTokenCount || 0;
      const totalTokens = usageMetadata.totalTokenCount || promptTokens + completionTokens;

      const normalized: NormalizedResponse = {
        id: `google-${uuidv4()}`,
        text,
        model,
        provider: this.providerId,
        usage: {
          promptTokens,
          completionTokens,
          totalTokens,
        },
        cost: {
          inputCostUsd: (promptTokens / 1e6) * 0.075,
          outputCostUsd: (completionTokens / 1e6) * 0.3,
          totalCostUsd: ((promptTokens / 1e6) * 0.075) + ((completionTokens / 1e6) * 0.3),
        },
        latencyMs: Date.now() - startTime,
        rawResponse: data,
      };

      return normalized;
    } catch (err) {
      throw new VectrionProviderError(
        `Google API request execution failed: ${err instanceof Error ? err.message : String(err)}`,
        this.providerId,
        err,
      );
    }
  }
}
