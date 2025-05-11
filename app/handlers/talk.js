import config from '../../config/index.js';
import { t } from '../../locales/index.js';
import { ROLE_AI, ROLE_HUMAN } from '../../services/openai.js';
import { generateCompletion } from '../../utils/index.js';
import { COMMAND_BOT_CONTINUE, COMMAND_BOT_FORGET, COMMAND_BOT_TALK } from '../commands/index.js';
import Context from '../context.js';
import { updateHistory } from '../history/index.js';
import { getPrompt, setPrompt } from '../prompt/index.js';

/**
 * @param {Context} context
 * @returns {boolean}
 */
const check = (context) => (
  context.hasCommand(COMMAND_BOT_TALK)
  || context.hasBotName
  || context.source.bot.isActivated
);

/**
 * @param {Context} context
 * @returns {Promise<Context>}
 */
const exec = async (context) => {
    if (!check(context)) return context;
    const prompt = getPrompt(context.userId);
    const userInput = context.event.message.text;

    try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_API_KEY = process.env.SUPABASE_API_KEY;
    const axios = (await import('axios')).default;
    const headers = {
        apikey: SUPABASE_API_KEY,
        Authorization: `Bearer ${SUPABASE_API_KEY}`,
    };
    const keywords = userInput.split(/\s+|[。！？\?\!]/).filter(k => k.length > 1);
    const keywordFilters = keywords.map(k => `title.ilike.*${k}*`).join(',');
    const questionFilters = keywords.map(k => `question.ilike.*${k}*`).join(',');

    const { data: courses } = await axios.get(`${SUPABASE_URL}/rest/v1/courses`, {
        headers,
        params: {
            select: 'title,time',
            or: keywordFilters
        }
    });
    const { data: qas } = await axios.get(`${SUPABASE_URL}/rest/v1/qa_list`, {
        headers,
        params: {
            select: 'question,answer',
            or: questionFilters
        }
    });

    if ((courses && courses.length > 0) || (qas && qas.length > 0)) {
        let contextText = '';
        if (courses.length > 0) {
            contextText += '【通識課程】\n';
            courses.forEach(c => {
                contextText += `課程名稱：${c.title}\n上課時間：${c.time}\n\n`;
          });
      }
      if (qas.length > 0) {
          contextText += '【常見問答】\n';
          qas.forEach(q => {
              contextText += `Q：${q.question}\nA：${q.answer}\n\n`;
          });
      }

      const { text } = await generateCompletion({
          messages: [
              { role: 'system', content: '你是中原大學的課程助理，只能根據以下提供的課程與QA資訊回答問題，不可自由發揮，若找不到請回覆「查無資料」即可。' },
              { role: ROLE_HUMAN, content: userInput },
              { role: ROLE_AI, content: contextText },
          ]
      });
      await context.sendText(text);
      return context;
    }
  } catch (e) {
    console.error('[TALK:GPT查詢失敗]', e);
  }
    
    try {
      if (context.event.isText) {
        prompt.write(ROLE_HUMAN, `${t('__COMPLETION_DEFAULT_AI_TONE')(config.BOT_TONE)}${context.trimmedText}`).write(ROLE_AI);
      }
      if (context.event.isImage) {
        const { trimmedText } = context;
        prompt.writeImage(ROLE_HUMAN, trimmedText).write(ROLE_AI);
      }
      const { text, isFinishReasonStop } = await generateCompletion({ prompt });
      prompt.patch(text);
      setPrompt(context.userId, prompt);
      updateHistory(context.id, (history) => history.write(config.BOT_NAME, text));
      const actions = isFinishReasonStop ? [COMMAND_BOT_FORGET] : [COMMAND_BOT_CONTINUE];
      context.pushText(text, actions);
    } catch (err) {
      context.pushError(err);
    }
    return context;
  }
};

export default exec;
