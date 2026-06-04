import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCors from '@fastify/cors';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const fastify = Fastify({ logger: true });

await fastify.register(fastifyCors, { origin: true });
await fastify.register(fastifyStatic, {
  root: join(__dirname, 'static'),
  prefix: '/',
});

const DEEPSEEK_API = 'https://api.deepseek.com/v1/chat/completions';

async function callDeepSeek(messages, temperature = 0.9) {
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
      max_tokens: 2000,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DeepSeek API 错误: ${res.status} ${err}`);
  }

  const data = await res.json();
  return data.choices[0].message.content;
}

const STYLES = {
  '种草': '热情安利，像一个朋友发现了宝藏迫不及待分享，多用感叹和主观感受',
  '避雷': '真诚劝退，有理有据地说为什么不值得买/不值得去，语气要实在不夸张',
  '测评': '客观对比，列出优缺点，像做过功课的专业人士，有理有据',
  '好物分享': '日常感分享，像在跟闺蜜聊天时随口提到的推荐，不要太用力',
  '教程': '步骤清晰，手把手教学，语气耐心细致，每一步都说清楚',
  '日常': '生活碎片式记录，有画面感和情绪，像发朋友圈',
  '穿搭': '搭配思路分享，描述一套look的细节和感觉，带点时尚感但不装',
  '美食': '色香味俱全的描述，让人看了就想吃，带点探店/自制的新鲜感',
  '旅行': '目的地/路线的体验分享，有画面感和个人感受，像朋友刚回来在讲',
  '情绪共鸣': '走心文字，引发共情，可以是一段感悟/一段话/一种状态描述',
};

const LENGTHS = {
  '短': '整篇文案控制在50-100字，短小精悍，一眼能看完',
  '中': '整篇文案控制在150-250字，信息量适中，有完整感受',
  '长': '整篇文案控制在300-500字，内容比较丰富，有细节有故事',
};

function deAItify(text) {
  let t = text;
  const replacements = [
    [/首先[，,、]/g, ''], [/其次[，,、]/g, ''], [/最后[，,、]/g, ''],
    [/总的来说[，,、]/g, ''], [/总而言之[，,、]/g, ''], [/综上所述[，,、]/g, ''],
    [/值得一提的是[，,、]/g, '顺便说一句'], [/不容错过/g, '值得试试'],
    [/绝对不会让你失望/g, '我觉得可以'], [/绝对不会后悔/g, '不亏'],
    [/强烈推荐/g, '很推荐'], [/性价比极高/g, '很划算'],
    [/性价比超高/g, '挺值的'], [/物超所值/g, '值这个价'],
    [/一定要试试/g, '可以试试'], [/你一定不能错过/g, '值得看看'],
    [/\\*\\*/g, ''],
  ];
  for (const [p, r] of replacements) t = t.replace(p, r);
  return t;
}

fastify.post('/api/generate', async (req, reply) => {
  const { topic, style = '种草', count = 2, length = '中' } = req.body || {};

  if (!topic || !topic.trim()) {
    return reply.status(400).send({ error: '请输入话题/产品关键词' });
  }

  const styleGuide = STYLES[style] || STYLES['种草'];
  const lengthGuide = LENGTHS[length] || LENGTHS['中'];

  const systemPrompt = `你是一个真实的小红书用户，不是AI助手。你在分享你的真实体验和感受。

写作要求：
- 语气：像在跟朋友聊天，用"我"的口吻，不要用"小编""博主"这种词
- 句式：用短句，多换行，不要写长段落。不要用"首先/其次/最后"这类结构词
- 内容风格：${styleGuide}
- 篇幅：${lengthGuide}
- 结尾加上3-5个相关话题标签，用 #xxx 格式
- 不要用任何markdown格式符号，不要用**加粗**
- 可以用emoji，但一篇里不超过3个，选最贴切的
- 每段不超过3行，段与段之间空一行
- 第一句话就是正文内容，不要以"标题："或"正文："开头`;

  const userPrompt = `请帮我写一篇关于"${topic}"的小红书笔记，${style}风格。给我${count}个不同切入点的版本。

每个版本用 "=== 版本 X ===" 分隔。

每个版本的结构：
- 第一行是一句话封面图描述（用"封面："开头）：描述适合配什么图，包含场景、色调、画面元素
- 然后空一行
- 正文：直接写正文内容，第一句话就是正文，不要写"标题：""正文："这类前缀
- 正文结尾换行后加上标签`;

  try {
    const raw = await callDeepSeek([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    const rawVersions = raw.split(/===?\s*版本\s*\d+\s*===?/).map(v => v.trim()).filter(v => v.length > 30);

    const versions = rawVersions.map(v => {
      let coverDesc = '';
      let body = v;

      const coverMatch = v.match(/^封面[：:]\s*(.+?)(?:\n|$)/);
      if (coverMatch) {
        coverDesc = coverMatch[1].trim();
        body = v.replace(coverMatch[0], '').trim();
      }

      // 提取标题（正文第一段）
      const bodyLines = body.split('\n').filter(l => l.trim());
      const title = bodyLines[0]?.replace(/^[#*\s]+/, '').trim() || '';

      // 提取尾部标签
      let content = body;
      const tagMatch = content.match(/(\s*#[^\s#]+\s*)+$/);
      const tags = tagMatch ? tagMatch[0].trim().replace(/\s+/g, ' ') : '';
      if (tagMatch) {
        content = content.slice(0, tagMatch.index).trim();
      }

      content = deAItify(content);

      return {
        title: title || '分享我的发现',
        content,
        tags,
        coverDesc: coverDesc || `${topic}相关的场景或产品图`,
      };
    });

    return { versions };
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ error: '生成失败：' + err.message, versions: [] });
  }
});

const PORT = process.env.PORT || 3000;
try {
  await fastify.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`🚀 小红笔已启动: http://localhost:${PORT}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
