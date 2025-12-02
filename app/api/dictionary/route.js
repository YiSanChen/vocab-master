import { NextResponse } from 'next/server';
import axios from 'axios';
import * as cheerio from 'cheerio';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const word = searchParams.get('word');

  if (!word) {
    return NextResponse.json({ error: '請輸入單字' }, { status: 400 });
  }

  const formattedWord = word.trim().toLowerCase().replace(/\s+/g, '-');
  const targetUrl = `https://dictionary.cambridge.org/zht/詞典/英語-漢語-繁體/${formattedWord}`;

  try {
    const { data } = await axios.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      }
    });

    const $ = cheerio.load(data);

    if ($('.di-title').length === 0 && $('.def-block').length === 0) {
      return NextResponse.json({ error: '找不到該單字，請檢查拼寫' }, { status: 404 });
    }

    let result = {
      word: word,
      definition: '',
      examples: []
    };

    const firstDefBlock = $('.def-block').first();

    if (firstDefBlock.length > 0) {
      const cnDef = firstDefBlock.find('.trans').first().text().trim();
      result.definition = cnDef;

      firstDefBlock.find('.examp').each((i, element) => {
        if (result.examples.length >= 2) return false;

        const el = $(element);
        const enSentence = el.find('.eg').text().trim();
        const cnSentence = el.find('.trans').text().trim();

        if (enSentence && cnSentence) {
          result.examples.push({
            en: enSentence,
            cn: cnSentence
          });
        }
      });
    } else {
       return NextResponse.json({ error: '解析失敗，無法找到定義' }, { status: 500 });
    }

    return NextResponse.json(result);

  } catch (error) {
    console.error('Error:', error.message);
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}