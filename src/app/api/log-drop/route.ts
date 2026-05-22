import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // TODO: ここに実際のGoogle Apps Script (GAS) のWebアプリURLなどを設定します。
    // 例: const SPREADSHEET_API_URL = process.env.SPREADSHEET_API_URL;
    const SPREADSHEET_API_URL = '';

    console.log('Received log request:', body);

    if (SPREADSHEET_API_URL) {
      // 実際のスプレッドシート連携（GAS等）の呼び出し
      /*
      const response = await fetch(SPREADSHEET_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error('Failed to log to spreadsheet');
      }
      */
    } else {
      console.log('Spreadsheet API URL is not set. Mocking success.');
    }

    return NextResponse.json({ success: true, message: 'Logged successfully' });
  } catch (error) {
    console.error('Log API Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process request' },
      { status: 500 }
    );
  }
}
