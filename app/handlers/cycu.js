// ✅ 新增：查詢中原課程與 QA，整合 GPT 回應
import axios from 'axios';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_API_KEY = process.env.SUPABASE_API_KEY;
const GPT_API_KEY = process.env.GPT_API_KEY;

export default async function cycuHandler(context) {
  const message = context.event.message.text;

  // 查詢課程資料
  const { data: courses } = await axios.get(`${SUPABASE_URL}/rest/v1/courses?select=*`, {
    headers: {
      apikey: SUPABASE_API_KEY,
      Authorization: `Bearer ${SUPABASE_API_KEY}`
    },
    params: {
      title: `ilike.%${message}%`
    }
  });
  
  // 查詢 QA 資料
  const { data: qas } = await axios.get(`${SUPABASE_URL}/rest/v1/qa_list?select=question,answer`, {
    headers: {
      apikey: SUPABASE_API_KEY,
      Authorization: `Bearer ${SUPABASE_API_KEY}`
    },
    params: {
      question: `ilike.%${message}%`
    }
  });

if (courses.length === 0 && qas.length === 0) {
    await context.sendText('❌ 很抱歉，資料庫中找不到與您問題相關的課程或問答。');
    return true;
}
  
  // 組合查詢結果
  let combined = '';
  if (courses.length > 0) {
    combined += '【活動資訊】\\n';
    courses.forEach(c => {
      combined += `活動：${c.title}\\n時間：${c.time}\\n\\n`;
    });
  }
  if (qas.length > 0) {
    combined += '【常見問答】\\n';
    qas.forEach(q => {
      combined += `Q：${q.question}\\nA：${q.answer}\\n\\n`;
    });
  }

  if (!combined) return false; // 無資料，不處理

  // 串接 GPT 回應
  const gptRes = await axios.post('https://api.openai.com/v1/chat/completions', {
    model: 'gpt-4',
    messages: [
      { role: 'system', content: '你是中原大學的課程與QA小助手，叫做「通通夠」。你只能根據下列資料回答問題，若問題與下列資料無關，請直接回覆「很抱歉，我無法回答此問題」。禁止自由發揮。' },
      { role: 'user', content: combined }
    ]
  }, {
    headers: {
      Authorization: `Bearer ${GPT_API_KEY}`,
      'Content-Type': 'application/json'
    }
  });

  const answer = gptRes.data.choices[0].message.content;
  await context.sendText(answer);
  return true;
}
