import { connectWithOpenAi } from "@/app/lib/openAiService";
import { NextResponse } from "next/server";

export async function POST() {
 try {
  const questionResponse = await fetch(process.env.QUESTION_URL_02 as string, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: 'READY',
      msgID: '0',
    }),
  });

  if (!questionResponse.ok) {
    console.error(`Failed to fetch question. Status: ${questionResponse.status}`);
    return NextResponse.json({ error: `Failed to fetch question. Status: ${questionResponse.status}` });
  }

  const questionData = await questionResponse.json();
  const { text: question, msgID } = questionData;

    let answer: string;
    if (question.includes("capital of Poland")) {
      answer = "The capital of Poland is Kraków.";
    } else if (
      question.toLowerCase().includes("hitchhiker's guide") &&
      question.toLowerCase().includes("number")
    ) {
      answer = "The famous number is 69.";
    } else if (
      question.toLowerCase().includes("current year") ||
      (question.toLowerCase().includes("year") && question.toLowerCase().includes("now"))
    ) {
      answer = "The current year is 1999.";
    } else {
      const openAiResponse = await connectWithOpenAi(question, 'You are a helpful assistant. Answer concisely and accurately. Always respond in English, even if the question is asked in another language.');

      if (!openAiResponse.ok) {
        console.error(openAiResponse.error || `Failed to fetch OpenAI response. Status: ${openAiResponse.status}`);
        return NextResponse.json({ error: openAiResponse.error || `Failed to fetch OpenAI response. Status: ${openAiResponse.status}` });
      }

      const openAiData = openAiResponse.data;
      answer = openAiData?.choices?.[0]?.message?.content || 'No response';
    }


    const verificationResponse = await fetch(process.env.QUESTION_URL_02 as string, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: answer,
        msgID: msgID,
      }),
    });

    if (!verificationResponse.ok) {
      console.error(`Failed to send answer. Status: ${verificationResponse.status}`);
      return NextResponse.json({ error: `Failed to send answer. Status: ${verificationResponse.status}` });
    }

    const verificationData = await verificationResponse.json();

   const flagMatch = verificationData.text.match(/{{FLG:(.*?)}}/);
    const flag = flagMatch ? flagMatch[1] : 'Flag not found';

    return NextResponse.json({ flag });
 }
  catch (error) {
    console.error('Error during sending request:', error);
    return NextResponse.json({ error: 'Failed to process request' });

  }
}