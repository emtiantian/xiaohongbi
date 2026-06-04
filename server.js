import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCors from '@fastify/cors';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const fastify = Fastify({ logger: true });

await fastify.register(fastifyCors, { origin: true });

await fastify.register(fastifyStatic, {
  root: join(__dirname, 'static'),
  prefix: '/',
});

// DeepSeek API 调用
const DEEPSEEK_API = 'https://api.deepseek.com/v1/chat/completions';

async function callDeepSeek(messages, temperature = 0.8) {
  const apiKey = process.env.DEEPSEEK_API_KEY || '';
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY 未设置');

  const res = await fetch(DEEPSEEK_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages,
      temperature,
      max_tokens: 1500,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DeepSeek API 错误: ${res.status} ${err}`);
  }

  const data = await res.json();
  return data.choices[0].message.content;
}

// 生成文案 API
fastify.post('/api/generate', async (req, reply) => {
  const { topic, style = '种草', count = 3, length = '中' } = req.body || {};

  if (!topic || !topic.trim()) {
    return reply.status(400).send({ error: '请输入话题/产品关键词' });
  }

  const lengthGuide = { '短': '50-80字', '中': '150-250字', '长': '300-500字' };
  const targetLength = lengthGuide[length] || '150-250字';

  const systemPrompt = `你是一个资深小红书内容运营专家。你擅长写出高互动率的小红书文案。

你的任务是为用户生成高质量的${style}类小红书文案。每篇文案需包含：
1. 标题：使用爆款标题公式（数字+情绪+结果/痛点）
2. 正文：按${style}风格写，自然使用💖✨🔥✅🎯🌟💯💥等emoji，每段不超过3行
3. 标签：推荐3-5个相关话题标签

要求：
- 语气亲切真实，像闺蜜分享
- 每篇文案长度控制在${targetLength}
- 排版清晰易读，每段1-3行
- 不要在同⼀篇文案中重复使用相同的emoji`;

  const userPrompt = `请为"${topic}"生成${count}个不同角度的小红书${style}类文案版本。每个版本用 "=== 版本 X ===" 分隔。`;

  try {
    const raw = await callDeepSeek([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    // 解析返回内容为版本数组
    const versions = raw
      .split(/===?\s*版本\s*\d+\s*===?/)
      .map(v => v.trim())
      .filter(v => v.length > 20);

    return { versions, raw };
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ error: '生成失败: ' + err.message });
  }
});

// 启动服务
const PORT = process.env.PORT || 3000;
try {
  await fastify.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`🚀 小红笔已启动: http://localhost:${PORT}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
