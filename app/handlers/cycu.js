import config from '../../config/index.js';
import { ROLE_AI, ROLE_HUMAN } from '../../services/openai.js';
import { generateCompletion } from '../../utils/index.js';
import Context from '../context.js';

// ✅ 只有在啟動狀態時處理（你也可加其它條件）
const check = (context) => context.source.bot.isActivated;

// ✅ 主執行函式
const exec = async (context) => {
  const userInput = context.event.message.text;

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_API_KEY = process.env.SUPABASE_API_KEY;

  const headers = {
    apikey: SUPABASE_API_KEY,
    Authorization: `Bearer ${SUPABASE_API_KEY}`,
  };

  const axios = (await import('axios')).default;

  // 🔍 將 userInput 分詞（空格或標點符號）模糊處理組合條件
  const keywords = userInput.split(/\s+|[。！？\?\!]/).filter(k => k.length > 1);
  const keywordFilters = keywords.map(k => `title.ilike.*${k}*`).join(',');
  const questionFilters = keywords.map(k => `question.ilike.*${k}*`).join(',');

  // 🔍 查詢課程資料
  const { data: courses } = await axios.get(`${SUPABASE_URL}/rest/v1/courses`, {
    headers,
    params: {
      select: 'title,time',
      or: keywordFilters
    }
  });
  console.log('[SUPABASE] courses:', courses);
  // 🔍 查詢 QA 資料
  const { data: qas } = await axios.get(`${SUPABASE_URL}/rest/v1/qa_list`, {
    headers,
    params: {
      select: 'question,answer',
      or: questionFilters
    }
  });
  console.log('[SUPABASE] qas:', qas);

  // ❌ 無資料就結束
  if ((!courses || courses.length === 0) && (!qas || qas.length === 0)) {
    await context.sendText('❌ 很抱歉，資料庫中找不到與您問題相關的課程或問答。');
    return context;
  }

  // ✅ 有資料 → 組合 prompt
  let contextText = '';
  if (courses.length > 0) {
    contextText += '【通識活動】\n';
    courses.forEach(c => {
      contextText += `活動名稱：${c.title}\n時間：${c.time}\n\n`;
    });
  }
  if (qas.length > 0) {
    contextText += '【常見問答】\n';
    qas.forEach(q => {
      contextText += `Q：${q.question}\nA：${q.answer}\n\n`;
    });
  }

  const prompt = [
    { role: ROLE_HUMAN, content: userInput },
    { role: ROLE_AI, content: contextText },
  ];

  // 🎯 嚴格指示 GPT：只能根據 contextText 回答
  const { text } = await generateCompletion({
    messages: [
      { role: 'system', content: '你是中原大學的課程助理名叫【通通夠】，只能根據以下提供的課程與QA資訊回答問題，不可自由發揮，若找不到請回覆「查無資料」即可。' },
      ...prompt,
    ],
  });

  await context.sendText(text);
  return context;
};

export default { check, exec };
