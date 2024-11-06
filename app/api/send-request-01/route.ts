import { connectWithOpenAi } from '@/app/lib/openAiService';
import { NextResponse } from 'next/server';

export async function POST() {
  try {
    // 1. Get html with question
    const questionResponse = await fetch(process.env.QUESTION_URL_01 as string);

    const questionPage = await questionResponse.text();
    const questionMatch = questionPage.match(/<p id="human-question">.*?<br\s*\/?>\s*(.*?)<\/p>/);
    const question = questionMatch ? questionMatch[1].trim() : null;

    if (!question) {
      return NextResponse.json({ error: 'Nie znaleziono pytania na stronie' });
    }

    // 2. Send question to OpenAI and get answer
    const openAiResponse = await connectWithOpenAi(question, 'Return only the correct answer. Be concise. If the question includes "rok", return only the year as a number.');

    const answer = openAiResponse?.choices?.[0]?.message?.content;

    // 3. Log to side in and get flag and url to file
    const loginResponse = await fetch(process.env.QUESTION_URL_01 as string, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `username=${process.env.USERNAME_01}&password=${process.env.PASSWORD_01}&answer=${answer}`,
      credentials: 'include',
    });
    const loggedPage = await loginResponse.text();

    const flagMatch = loggedPage.match(/{{FLG:(.*?)}}/);
    const flag = flagMatch ? flagMatch[1] : 'Flaga nieznaleziona';

    const urlMatch = loggedPage.match(/<a href="(\/files\/[^"]+)">/);
    const fileUrl = urlMatch ? `${process.env.QUESTION_URL_01}${urlMatch[1]}` : null;

    if (!fileUrl) {
      return NextResponse.json({ flag, error: 'Nie znaleziono URL do pliku' });
    }

    // 6. Get file content from url
    const fileResponse = await fetch(fileUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'text/plain',
      },
      credentials: 'include',
    });
    const fileContent = await fileResponse.text();

    // 7. Return flag and send file content to client
    return NextResponse.json({ flag, fileContent });
  } catch (error) {
    console.error('Błąd podczas logowania i pobierania:', error);
    return NextResponse.json({ error: 'Błąd podczas logowania i pobierania' });
  }
}
